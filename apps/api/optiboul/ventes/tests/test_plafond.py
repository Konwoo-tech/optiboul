from datetime import timedelta

import pytest
from django.urls import reverse

from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.conftest import MARDI_8H
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.infrastructure.models import Demande
from optiboul.ventes.infrastructure.models import Livraison

from .test_livraisons import livrer

pytestmark = pytest.mark.django_db

TRENTE_BAGUETTES = {"BAG": 30}  # 3 000 FCFA au prix de base : 1 000 de trop


def _solde(client_de, qui, client) -> int:
    detail = reverse("api:client-detail", kwargs={"pk": client.pk})
    return client_de(qui).get(detail).json()["solde"]


def test_bloquee_au_dela_du_plafond(client_de, caissiere, caisse, mama):
    reponse = livrer(
        client_de(caissiere),
        {"client": mama.pk, "lignes": TRENTE_BAGUETTES},
    )
    assert reponse.status_code == 409
    refus = reponse.json()
    assert refus["code"] == "plafond_depasse"
    assert refus["manque"] == 1_000
    assert refus["solde_apres"] == -3_000
    assert refus["plafond"] == 2_000
    assert refus["actions"] == ["encaisser_le_manque", "demander"]
    assert not Livraison.objects.exists()
    proposee = client_de(caissiere).get(
        reverse("api:livraison-proposition"),
        {"client": mama.pk},
    )
    assert proposee.json()["manque"] == 0


def test_encaisser_le_manque(client_de, caissiere, caisse, mama):
    reponse = livrer(
        client_de(caissiere),
        {
            "client": mama.pk,
            "lignes": TRENTE_BAGUETTES,
            "paiement": {"mode": "especes", "montant": 1_000},
        },
    )
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["solde_apres"] == -2_000


def test_demander_sans_bloquer_la_file(
    client_de,
    caissiere,
    gerant,
    caisse,
    mama,
    rachel_boutique,
):
    reponse = livrer(
        client_de(caissiere),
        {
            "client": mama.pk,
            "lignes": TRENTE_BAGUETTES,
            "demander_autorisation": "Paie samedi comme d'habitude",
        },
        "en-attente",
    )
    assert reponse.status_code == 202, reponse.content
    livraison = reponse.json()
    assert livraison["statut"] == "en_attente"
    assert livraison["demande"] == "DEM-001"
    # Le compte n'est pas débité avant l'accord.
    assert not MouvementCompte.objects.exists()
    demande = Demande.objects.get()
    assert (demande.type, demande.objet_id) == ("plafond", livraison["id"])
    assert demande.details["plafond"] == 2_000
    assert demande.objet == f"Mama Rasta · bon n° {livraison['numero']} · 3000 FCFA"
    assert LigneJournal.objects.filter(action="livraison.en_attente").exists()
    # La caisse sert le client suivant pendant l'attente.
    suivant = livrer(
        client_de(caissiere),
        {"client": rachel_boutique.pk, "lignes": {"BAG": 10}},
        "suivant",
    )
    assert suivant.status_code == 201
    # Accord du gérant : la livraison passe et le compte est débité.
    accord = client_de(gerant).post(
        reverse("api:demande-accorder", kwargs={"pk": demande.pk}),
        {},
        format="json",
    )
    assert accord.status_code == 200, accord.content
    livree = client_de(caissiere).get(
        reverse("api:livraison-detail", kwargs={"pk": livraison["id"]}),
    )
    assert livree.json()["statut"] == "livree"
    assert livree.json()["autorisee_par"] == "Willy"
    assert livree.json()["solde_apres"] == -3_000
    assert _solde(client_de, caissiere, mama) == -3_000
    assert LigneJournal.objects.filter(action="livraison.autorisee").exists()


def test_refus_du_gerant(client_de, caissiere, proprietaire, caisse, mama):
    reponse = livrer(
        client_de(caissiere),
        {
            "client": mama.pk,
            "lignes": TRENTE_BAGUETTES,
            "paiement": {"mode": "especes", "montant": 500},
            "demander_autorisation": "Paie demain",
        },
    )
    assert reponse.status_code == 202
    # L'argent reçu est déjà encaissé, même pendant l'attente.
    assert _solde(client_de, caissiere, mama) == 500
    demande = Demande.objects.get()
    refus = client_de(proprietaire).post(
        reverse("api:demande-refuser", kwargs={"pk": demande.pk}),
        {"motif": "Trop de dettes ce mois-ci"},
        format="json",
    )
    assert refus.status_code == 200
    livraison = Livraison.objects.get()
    assert (livraison.statut, livraison.autorisee_par) == ("refusee", "Fotso")
    assert _solde(client_de, caissiere, mama) == 500


@pytest.mark.parametrize(("minutes", "parametre"), [(10, None), (3, 3)])
def test_echeance_de_la_demande(
    client_de,
    caissiere,
    proprietaire,
    caisse,
    mama,
    minutes,
    parametre,
):
    if parametre is not None:
        client_de(proprietaire).put(
            reverse("api:parametre-detail", kwargs={"cle": "echeance_demande_plafond"}),
            {"valeur": parametre},
            format="json",
        )
    livrer(
        client_de(caissiere),
        {
            "client": mama.pk,
            "lignes": TRENTE_BAGUETTES,
            "demander_autorisation": "Samedi",
        },
    )
    demande = Demande.objects.get()
    assert demande.echeance == MARDI_8H + timedelta(minutes=minutes)


def test_sous_le_plafond_le_motif_est_ignore(client_de, caissiere, caisse, mama):
    reponse = livrer(
        client_de(caissiere),
        {"client": mama.pk, "lignes": {"BAG": 5}, "demander_autorisation": "inutile"},
    )
    assert reponse.status_code == 201
    assert reponse.json()["demande"] is None
    assert not Demande.objects.exists()
