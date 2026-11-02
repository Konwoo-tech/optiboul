import pytest
from django.urls import reverse

from optiboul.caisse.domain.caisses import GenreMouvement
from optiboul.caisse.domain.caisses import remise_proposee
from optiboul.caisse.infrastructure.models import MouvementCaisse
from optiboul.core.infrastructure.models import LigneJournal


def test_remise_proposee_au_dela_du_plafond():
    assert remise_proposee(100_000, 20_000, 100_000) == 0
    assert remise_proposee(130_000, 20_000, 100_000) == 110_000


def _remettre(client, caisse, corps, cle="r"):
    return client.post(
        reverse("api:caisse-remettre", kwargs={"pk": caisse.pk}),
        corps,
        format="json",
        HTTP_IDEMPOTENCY_KEY=cle,
    )


@pytest.fixture
def caisse_pleine(caisse_ouverte, caissiere):
    """110 000 FCFA encaissés : 130 000 en caisse avec le fonds."""
    MouvementCaisse.objects.create(
        caisse=caisse_ouverte,
        genre=GenreMouvement.ESPECES,
        montant=110_000,
        auteur=caissiere,
    )
    return caisse_ouverte


pytestmark = pytest.mark.django_db


def test_proposition_puis_remise_au_gerant(client_de, caissiere, gerant, caisse_pleine):
    especes = (
        client_de(caissiere)
        .get(
            reverse("api:caisse-especes", kwargs={"pk": caisse_pleine.pk}),
        )
        .json()
    )
    assert (especes["attendu"], especes["remise_proposee"]) == (130_000, 110_000)
    reponse = _remettre(
        client_de(caissiere),
        caisse_pleine,
        {"montant": 110_000, "receveur": gerant.pk},
    )
    assert reponse.status_code == 201, reponse.content
    assert (reponse.json()["remises"], reponse.json()["attendu"]) == (110_000, 20_000)
    assert reponse.json()["remise_proposee"] == 0
    remise = MouvementCaisse.objects.get(genre="remise")
    assert (remise.receveur, remise.libelle) == (gerant, "Remise au gérant")
    trace = LigneJournal.objects.get(action="caisse.remise")
    assert (trace.apres or {})["heure"] == "2026-10-27T08:00:00+01:00"


def test_remise_au_coffre(client_de, gerant, caisse_pleine):
    reponse = _remettre(client_de(gerant), caisse_pleine, {"montant": 50_000})
    assert reponse.status_code == 201
    assert MouvementCaisse.objects.get(genre="remise").receveur is None


def test_refus(client_de, caissiere, responsable_production, caisse_pleine):
    trop = _remettre(client_de(caissiere), caisse_pleine, {"montant": 200_000}, "a")
    assert (trop.json()["code"], trop.json()["disponible"]) == (
        "montant_invalide",
        130_000,
    )
    receveur = _remettre(
        client_de(caissiere),
        caisse_pleine,
        {"montant": 1_000, "receveur": responsable_production.pk},
        "b",
    )
    assert receveur.json()["code"] == "receveur_invalide"
    sans_cle = client_de(caissiere).post(
        reverse("api:caisse-remettre", kwargs={"pk": caisse_pleine.pk}),
        {"montant": 1_000},
        format="json",
    )
    assert sans_cle.json()["code"] == "cle_idempotence_absente"
