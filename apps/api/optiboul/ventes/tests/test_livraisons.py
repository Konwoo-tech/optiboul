import pytest
from django.db import DatabaseError
from django.db import transaction
from django.urls import reverse

from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.conftest import MARDI
from optiboul.conftest import MARDI_8H
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users.tests.factories import utilisateur_avec_profil
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.livraisons import Ligne
from optiboul.ventes.domain.livraisons import lignes_facturees
from optiboul.ventes.domain.livraisons import montant_du
from optiboul.ventes.infrastructure.commandes import depot_commandes
from optiboul.ventes.infrastructure.models import Livraison

LISTE = reverse("api:livraison-list")
COMME_COMMANDE = reverse("api:livraison-livrer-comme-commande")


def test_montant_du_selon_le_tarif():
    lignes = lignes_facturees({"BAG": 100, "KO": 10}, {"BAG": 95, "KO": 70})
    assert lignes == [Ligne("BAG", 100, 95), Ligne("KO", 10, 70)]
    assert montant_du(lignes) == 10_200


def test_pas_de_livraison_sans_prix():
    with pytest.raises(RefusMetier) as refus:
        lignes_facturees({"BAG": 1, "PSL": 2}, {"BAG": 95, "PSL": None})
    assert refus.value.code == "prix_inconnu"
    assert refus.value.autres["produits"] == ["PSL"]


def livrer(client, corps, cle="cle-1"):
    return client.post(LISTE, corps, format="json", HTTP_IDEMPOTENCY_KEY=cle)


def commander(s44, client, lignes, caissiere):
    depot_commandes.enregistrer(
        semaine=s44.pk,
        client=client.pk,
        session=Session(MARDI, JOUR),
        lignes=lignes,
        apres_heure_limite=False,
        auteur=caissiere.pk,
        le=MARDI_8H,
    )


@pytest.mark.django_db
def test_livraison_au_tarif_du_client(client_de, caissiere, caisse, rachel_boutique):
    reponse = livrer(
        client_de(caissiere),
        {"client": rachel_boutique.pk, "lignes": {"BAG": 100, "KO": 10, "GC135": 0}},
    )
    assert reponse.status_code == 201, reponse.content
    livraison = reponse.json()
    assert livraison["numero"] == 1
    assert livraison["caisse"] == caisse.pk
    assert (livraison["jour"], livraison["creneau"]) == ("2026-10-27", "jour")
    assert livraison["lignes"] == [
        {"code": "BAG", "quantite": 100, "prix_unitaire": 95, "montant": 9_500},
        {"code": "KO", "quantite": 10, "prix_unitaire": 70, "montant": 700},
    ]
    assert livraison["montant_du"] == 10_200
    assert livraison["solde_avant"] == 0
    assert livraison["solde_apres"] == -10_200
    assert livraison["statut"] == "livree"
    mouvement = MouvementCompte.objects.get()
    assert (mouvement.sens, mouvement.montant) == (-1, 10_200)
    assert (mouvement.source_type, mouvement.source_id) == (
        "livraison",
        livraison["id"],
    )
    trace = LigneJournal.objects.get(action="livraison.enregistree")
    assert trace.apres is not None
    assert trace.apres["solde_apres"] == -10_200
    # Le solde du client est calculé depuis ses mouvements (R21).
    detail = reverse("api:client-detail", kwargs={"pk": rachel_boutique.pk})
    assert client_de(caissiere).get(detail).json()["solde"] == -10_200


@pytest.mark.django_db
def test_numeros_de_bon_sans_trou(client_de, caissiere, caisse, rachel_boutique, mama):
    numeros = [
        livrer(
            client_de(caissiere),
            {"client": c.pk, "lignes": {"BAG": 1}},
            cle,
        ).json()["numero"]
        for c, cle in [(rachel_boutique, "a"), (mama, "b"), (mama, "c")]
    ]
    assert numeros == [1, 2, 3]
    # Le solde avant de la seconde livraison de Mama tient compte de la première.
    derniere = Livraison.objects.get(numero=3)
    assert (derniere.solde_avant, derniere.solde_apres) == (-100, -200)


@pytest.mark.django_db
def test_double_clic_sans_double_livraison(client_de, caissiere, caisse, mama):
    corps = {"client": mama.pk, "lignes": {"BAG": 10}}
    premiere = livrer(client_de(caissiere), corps, "double-clic")
    seconde = livrer(client_de(caissiere), corps, "double-clic")
    assert seconde.status_code == 201
    assert seconde.json() == premiere.json()
    assert seconde.headers["Idempotent-Replayed"] == "true"
    assert Livraison.objects.count() == 1
    sans_cle = client_de(caissiere).post(LISTE, corps, format="json")
    assert sans_cle.status_code == 400
    assert sans_cle.json()["code"] == "cle_idempotence_absente"
    autre_chemin = client_de(caissiere).post(
        COMME_COMMANDE,
        {"client": mama.pk},
        format="json",
        HTTP_IDEMPOTENCY_KEY="double-clic",
    )
    assert autre_chemin.json()["code"] == "cle_idempotence_reutilisee"


@pytest.mark.django_db
def test_un_refus_ne_consomme_pas_la_cle(client_de, caissiere, caisse, mama):
    refus = livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"PSL": 1}}, "k")
    assert refus.json()["code"] == "prix_inconnu"
    reprise = livrer(
        client_de(caissiere),
        {"client": mama.pk, "lignes": {"BAG": 1}},
        "k",
    )
    assert reprise.status_code == 201


@pytest.mark.django_db
def test_livrer_comme_commande(
    client_de,
    caissiere,
    caisse,
    s44,
    rachel_boutique,
    mama,
):
    commander(s44, rachel_boutique, {"BAG": 200, "KO": 20}, caissiere)
    url = reverse("api:livraison-proposition")
    proposee = client_de(caissiere).get(url, {"client": rachel_boutique.pk}).json()
    assert proposee["lignes"] == [
        {"code": "BAG", "quantite": 200, "prix_unitaire": 95, "montant": 19_000},
        {"code": "KO", "quantite": 20, "prix_unitaire": 70, "montant": 1_400},
    ]
    assert proposee["montant_du"] == 20_400
    assert (proposee["solde"], proposee["solde_apres"]) == (0, -20_400)
    assert proposee["plafond"] == 2_000
    reponse = client_de(caissiere).post(
        COMME_COMMANDE,
        {"client": rachel_boutique.pk},
        format="json",
        HTTP_IDEMPOTENCY_KEY="une-touche",
    )
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["commande"] == proposee["commande"]
    assert reponse.json()["montant_du"] == 20_400
    sans_commande = client_de(caissiere).post(
        COMME_COMMANDE,
        {"client": mama.pk},
        format="json",
        HTTP_IDEMPOTENCY_KEY="sans",
    )
    assert sans_commande.json()["code"] == "aucune_commande"
    assert client_de(caissiere).get(url, {"client": mama.pk}).json()["lignes"] == []


@pytest.mark.django_db
def test_caisse_ouverte_obligatoire(client_de, caissiere, s44, horloge, mama):
    reponse = livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"BAG": 1}})
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "aucune_caisse_ouverte"


@pytest.mark.django_db
def test_qui_livre(
    client_de,
    caisse,
    gerant,
    responsable_production,
    proprietaire,
    mama,
):
    davy = utilisateur_avec_profil("caissier", name="Davy")
    corps = {"client": mama.pk, "lignes": {"BAG": 1}}
    assert livrer(client_de(davy), corps).json()["code"] == "caisse_d_une_autre"
    for refuse in (responsable_production, proprietaire):
        assert livrer(client_de(refuse), corps).status_code == 403
    assert livrer(client_de(gerant), corps).status_code == 201
    # Davy ne voit pas les livraisons de la caisse de Rachel ; le propriétaire les voit.
    assert client_de(davy).get(LISTE).json()["results"] == []
    assert client_de(proprietaire).get(LISTE).json()["count"] == 1


@pytest.mark.django_db
def test_client_inconnu(client_de, caissiere, caisse, mama):
    mama.actif = False
    mama.save()
    reponse = livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"BAG": 1}})
    assert reponse.json()["code"] == "client_inconnu"


@pytest.mark.django_db
def test_registre_des_comptes_en_ajout_seul(client_de, caissiere, caisse, mama):
    livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"BAG": 1}})
    with pytest.raises(DatabaseError, match="ajout seul"), transaction.atomic():
        MouvementCompte.objects.update(montant=1)
    with pytest.raises(DatabaseError, match="ajout seul"), transaction.atomic():
        MouvementCompte.objects.all().delete()
