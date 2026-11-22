"""Prix unitaire des matières, pour la fiche technique (#331)."""

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

MATIERES = reverse("api:matiere-list")


def _farine(reponse):
    return next(m for m in reponse.json() if m["code"] == "farine")


def test_prix_de_la_farine_au_prix_du_sac(
    client_de,
    proprietaire,
    responsable_production,
):
    # 19 525 FCFA le sac de 50 kg (CdC §9).
    assert _farine(client_de(proprietaire).get(MATIERES))["prix_unitaire"] == "390.50"
    assert (
        _farine(client_de(responsable_production).get(MATIERES))["prix_unitaire"]
        == "390.50"
    )


def test_sans_achat_ou_sans_droit_pas_de_prix(client_de, proprietaire, caissiere):
    matieres = client_de(proprietaire).get(MATIERES).json()
    assert next(m for m in matieres if m["code"] == "sel")["prix_unitaire"] is None
    assert _farine(client_de(caissiere).get(MATIERES))["prix_unitaire"] is None
