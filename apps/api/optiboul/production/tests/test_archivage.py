from datetime import date

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.domain.plan import est_avant
from optiboul.production.infrastructure.models import Production
from optiboul.production.infrastructure.tasks import archiver
from optiboul.ventes.domain.commandes import Session

LUNDI = date(2026, 10, 26)
MARDI = date(2026, 10, 27)


def test_ordre_des_sessions():
    assert est_avant(Session(LUNDI, "nuit"), Session(MARDI, "jour"))
    assert est_avant(Session(MARDI, "jour"), Session(MARDI, "nuit"))
    assert not est_avant(Session(MARDI, "nuit"), Session(MARDI, "nuit"))
    assert not est_avant(Session(MARDI, "nuit"), Session(MARDI, "jour"))


pytestmark = pytest.mark.django_db


def test_tourne_jusqu_a_la_session_suivante(production, heure):
    with heure(23):
        assert archiver() == 0
    assert Production.objects.get(pk=production["id"]).statut == "en_cours"


def test_session_depassee_archivee_et_signalee(
    client_de,
    production,
    proprietaire,
    gerant,
    heure,
):
    with heure(7, jour=date(2026, 10, 28)):
        assert archiver() == 1
        assert archiver() == 0
        alertes = client_de(proprietaire).get(reverse("api:alertes")).json()
    assert Production.objects.get(pk=production["id"]).statut == "non_cloturee"
    assert LigneJournal.objects.filter(action="production.non_cloturee").exists()
    assert Notification.objects.filter(
        genre="production.non_cloturee",
        destinataire=gerant,
    ).exists()
    assert "production_non_cloturee_ou_provisoire" in {a["type"] for a in alertes}
