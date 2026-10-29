from datetime import date
from datetime import datetime
from unittest import mock

import pytest

from optiboul.core.domain.semaines import FUSEAU
from optiboul.core.domain.semaines import bornes
from optiboul.core.infrastructure.models import CreneauPlanning
from optiboul.core.infrastructure.models import Semaine

MARDI_8H = datetime(2026, 10, 27, 8, 0, tzinfo=FUSEAU)  # S44, créneau de jour
MARDI = date(2026, 10, 27)


@pytest.fixture
def s44(db, gerant, responsable_production) -> Semaine:
    periode = bornes(2026, 44)
    return Semaine.objects.create(
        annee=2026,
        numero=44,
        debut=periode.debut,
        fin=periode.fin,
        statut="ouverte",
        gerant=gerant,
        production=responsable_production,
    )


@pytest.fixture
def planning_rachel(s44, caissiere) -> None:
    CreneauPlanning.objects.create(
        semaine=s44,
        jour=MARDI,
        creneau="jour",
        caissiere=caissiere,
    )


@pytest.fixture
def horloge():
    """Fige l'heure au mardi 08:00 de la semaine 44 (heure de Yaoundé)."""
    with mock.patch("django.utils.timezone.now", return_value=MARDI_8H) as maintenant:
        yield maintenant
