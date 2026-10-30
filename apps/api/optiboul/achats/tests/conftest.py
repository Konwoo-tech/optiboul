import pytest

from optiboul.achats.infrastructure.models import Fournisseur


@pytest.fixture
def minoterie(db) -> Fournisseur:
    fournisseur = Fournisseur.objects.create(
        nom="Minoterie du Centre",
        conditions="Lundi",
    )
    fournisseur.matieres.set(fournisseur.matieres.model.objects.filter(code="farine"))
    return fournisseur
