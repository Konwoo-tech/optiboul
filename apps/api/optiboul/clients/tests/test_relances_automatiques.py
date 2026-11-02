from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

import pytest

from optiboul.clients.domain.clients import relance_due
from optiboul.clients.infrastructure.models import Relance
from optiboul.clients.infrastructure.tasks import relances_automatiques
from optiboul.core.application.journal import Auteur
from optiboul.core.infrastructure.parametres import depot_parametres

YAOUNDE = ZoneInfo("Africa/Douala")
JEUDI_10H = datetime(2026, 10, 29, 10, 0, tzinfo=YAOUNDE)
JEUDI_9H = datetime(2026, 10, 29, 9, 59, tzinfo=YAOUNDE)
VENDREDI_10H = datetime(2026, 10, 30, 10, 0, tzinfo=YAOUNDE)


@pytest.mark.parametrize(
    ("moment", "attendu"),
    [(JEUDI_10H, True), (JEUDI_9H, False), (VENDREDI_10H, False)],
)
def test_relance_due(moment, attendu):
    assert relance_due(moment, ["jeudi", "samedi"], "10:00") is attendu


pytestmark = pytest.mark.django_db


def _a(moment):
    return mock.patch("django.utils.timezone.now", return_value=moment)


def test_une_seule_fois_par_jour(comptes):
    with _a(JEUDI_10H):
        assert relances_automatiques() == 1  # Raoul n'a pas de numéro
        assert relances_automatiques() == 0
    relance = Relance.objects.get()
    assert (relance.client.nom, relance.automatique) == ("Mama Rasta", True)
    assert relance.auteur is None


def test_hors_des_jours_prevus(comptes):
    with _a(VENDREDI_10H):
        assert relances_automatiques() == 0


def test_jours_et_heure_parametrables(comptes, proprietaire):
    auteur = Auteur(proprietaire.pk, proprietaire.name)
    depot_parametres.enregistrer("relances_jours", ["vendredi"], auteur)
    depot_parametres.enregistrer("relances_heure", "09:30", auteur)
    with _a(VENDREDI_10H):
        assert relances_automatiques() == 1
