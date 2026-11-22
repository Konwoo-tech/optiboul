"""Corriger et annuler une dépense en attente (#300), seuil lisible (#323)."""

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.infrastructure.models import Demande
from optiboul.depenses.infrastructure.models import Depense

DEPENSES = reverse("api:depense-list")

pytestmark = pytest.mark.django_db


def _saisir(client, montant, cle="a"):
    corps = {
        "categorie": "technique",
        "libelle": "Réparation du pétrin",
        "montant": montant,
        "paye_par": "caisse",
        "rattachement": "production",
    }
    return client.post(DEPENSES, corps, format="json", HTTP_IDEMPOTENCY_KEY=cle).json()


def _url(depense, nom="detail"):
    return reverse(f"api:depense-{nom}", kwargs={"pk": depense["id"]})


def _especes(client, caisse) -> int:
    url = reverse("api:caisse-especes", kwargs={"pk": caisse.pk})
    return client.get(url).json()["depenses"]


@pytest.fixture
def en_attente(client_de, caissiere, caisse_ouverte):
    depense = _saisir(client_de(caissiere), 60_000)
    assert depense["statut"] == "en_attente"
    return depense


def test_modifier_garde_l_attente(client_de, caissiere, en_attente):
    reponse = client_de(caissiere).patch(
        _url(en_attente),
        {"libelle": "Pétrin et courroie", "montant": 70_000},
        format="json",
    )
    assert reponse.status_code == 200, reponse.content
    assert (reponse.json()["libelle"], reponse.json()["montant"]) == (
        "Pétrin et courroie",
        70_000,
    )
    assert reponse.json()["statut"] == "en_attente"
    assert Demande.objects.get().statut == "en_attente"
    assert LigneJournal.objects.filter(action="depense.modifiee").exists()


def test_sous_le_seuil_elle_passe(client_de, caissiere, en_attente, caisse_ouverte):
    client = client_de(caissiere)
    reponse = client.patch(_url(en_attente), {"montant": 40_000}, format="json")
    assert reponse.json()["statut"] == "validee"
    assert Demande.objects.get().statut == "annulee"
    assert _especes(client, caisse_ouverte) == 40_000


def test_annuler_avec_motif(client_de, caissiere, en_attente, caisse_ouverte):
    client = client_de(caissiere)
    sans_motif = client.post(_url(en_attente, "annuler"), {"motif": " "}, format="json")
    assert sans_motif.json()["code"] == "motif_obligatoire"
    reponse = client.post(
        _url(en_attente, "annuler"),
        {"motif": "Saisie en double"},
        format="json",
    )
    assert reponse.json()["statut"] == "annulee"
    assert Demande.objects.get().statut == "annulee"
    assert _especes(client, caisse_ouverte) == 0
    trace = LigneJournal.objects.get(action="depense.annulee")
    assert (trace.apres or {}).get("demande") == "DEM-001"


def test_deja_decidee(client_de, caissiere, gerant, en_attente):
    demande = Demande.objects.get()
    client_de(gerant).post(
        reverse("api:demande-accorder", kwargs={"pk": demande.pk}),
        {},
        format="json",
    )
    reponse = client_de(caissiere).patch(
        _url(en_attente),
        {"montant": 1},
        format="json",
    )
    assert (reponse.status_code, reponse.json()["code"]) == (
        409,
        "depense_deja_decidee",
    )


def test_ni_un_autre_ni_le_moyen_de_paiement(
    client_de,
    caissiere,
    gerant,
    responsable_production,
    en_attente,
):
    autre = client_de(responsable_production).patch(
        _url(en_attente),
        {"montant": 1},
        format="json",
    )
    assert autre.status_code == 404  # il ne voit pas la dépense d'une autre
    direction = client_de(gerant).patch(
        _url(en_attente),
        {"libelle": "Corrigée par le gérant"},
        format="json",
    )
    assert direction.status_code == 200
    assert Depense.objects.get().libelle == "Corrigée par le gérant"


def test_refus_rien_a_defaire(client_de, caissiere, gerant, en_attente, caisse_ouverte):
    demande = Demande.objects.get()
    client_de(gerant).post(
        reverse("api:demande-refuser", kwargs={"pk": demande.pk}),
        {"motif": "Pas urgent"},
        format="json",
    )
    assert Depense.objects.get().statut == "refusee"
    assert _especes(client_de(caissiere), caisse_ouverte) == 0


def test_seuil_lisible_par_la_caisse(client_de, caissiere):
    reponse = client_de(caissiere).get(reverse("api:depense-seuil"))
    assert reponse.json() == {"seuil": 50_000}
