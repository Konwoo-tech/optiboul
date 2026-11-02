from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse

from optiboul.depenses.infrastructure.models import Depense
from optiboul.rapports.domain.indicateurs import marge_estimee
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.models import MouvementStock

YAOUNDE = ZoneInfo("Africa/Douala")
OCTOBRE = datetime(2026, 10, 15, 12, 0, tzinfo=YAOUNDE)
TABLEAU = reverse("api:tableau-de-bord")


def test_marge():
    assert marge_estimee(1_000_000, 400_000, 250_000) == 350_000


pytestmark = pytest.mark.django_db


@pytest.fixture
def activite(s44, gerant):
    MouvementStock.objects.create(
        matiere=Matiere.objects.get(code="farine"),
        sens=-1,
        quantite=Decimal(100),
        genre="production",
        source_type="production",
        source_id=1,
        semaine=s44,
        auteur=gerant,
        cree_le=OCTOBRE,
    )
    for numero, categorie, statut, montant in [
        (1, "salaires", "validee", 50_000),
        (2, "matieres", "validee", 90_000),
        (3, "electricite", "en_attente", 70_000),
    ]:
        Depense.objects.create(
            numero=numero,
            semaine=s44,
            categorie=categorie,
            libelle="Essai",
            montant=montant,
            paye_par="banque",
            rattachement="semaine",
            statut=statut,
            auteur=gerant,
            auteur_profil="gerant",
            cree_le=OCTOBRE,
        )


def test_matieres_valorisees_et_charges_validees(client_de, gerant, activite):
    reponse = client_de(gerant).get(TABLEAU, {"mois": "2026-10"})
    marge = reponse.json()["indicateurs"]["marge_estimee"]
    assert marge == {"matieres": 39_050, "charges": 50_000, "marge": -89_050}


def test_hors_du_mois(client_de, gerant, activite):
    reponse = client_de(gerant).get(TABLEAU, {"mois": "2026-11"})
    assert reponse.json()["indicateurs"]["marge_estimee"]["marge"] == 0
