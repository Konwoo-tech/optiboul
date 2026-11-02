import pytest
from django.urls import reverse

from optiboul.paie.infrastructure.models import Employe
from optiboul.paie.infrastructure.models import LignePaie


@pytest.fixture
def mireille(db) -> Employe:
    return Employe.objects.create(nom="Mireille Ngo", salaire_base=78_000)


@pytest.fixture
def paul(db) -> Employe:
    return Employe.objects.create(nom="Paul Atangana", salaire_base=100_000)


@pytest.fixture
def paie(client_de, gerant, mireille, paul):
    reponse = client_de(gerant).post(
        reverse("api:paie-preparer"),
        {"mois": "2026-10-15"},
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    return reponse.json()


@pytest.fixture
def ligne_mireille(paie, mireille) -> LignePaie:
    return LignePaie.objects.get(etat_id=paie["id"], employe=mireille)
