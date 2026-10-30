from datetime import UTC
from datetime import datetime
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.domain.envois import EtatInternet
from optiboul.notifications.domain.envois import etat_internet
from optiboul.notifications.infrastructure.envois import envoyer_en_attente
from optiboul.notifications.infrastructure.envois import file_envoi

ETAT = reverse("api:envois-etat")
PLUS_TARD = datetime(2100, 1, 1, tzinfo=UTC)
PASSERELLES = "optiboul.notifications.infrastructure.envois"


def test_etat_internet():
    avant = datetime(2026, 10, 27, 8, tzinfo=UTC)
    apres = datetime(2026, 10, 27, 9, tzinfo=UTC)
    assert etat_internet(None, None) is EtatInternet.INCONNU
    assert etat_internet(apres, avant) is EtatInternet.EN_LIGNE
    assert etat_internet(avant, apres) is EtatInternet.HORS_LIGNE
    assert etat_internet(None, apres) is EtatInternet.HORS_LIGNE


pytestmark = pytest.mark.django_db


def test_hors_ligne_puis_en_ligne(client_de, caissiere, settings):
    file_envoi.mettre_en_file(Canal.WHATSAPP, "677412018", "Bon n° 1")
    assert client_de(caissiere).get(ETAT).json()["internet"] == "inconnu"
    # Sans passerelle (comme sans réseau), la tentative échoue et le message attend.
    settings.OPTIBOUL_PASSERELLES = {}
    with mock.patch("django.utils.timezone.now", return_value=PLUS_TARD):
        envoyer_en_attente()
    etat = client_de(caissiere).get(ETAT).json()
    assert (etat["internet"], etat["en_attente"], etat["en_echec"]) == (
        "hors_ligne",
        1,
        0,
    )
    assert etat["plus_ancien_en_attente"] is not None
    settings.OPTIBOUL_PASSERELLES = {
        "whatsapp": f"{PASSERELLES}.PasserelleJournalisation",
    }
    with mock.patch(
        "django.utils.timezone.now",
        return_value=PLUS_TARD.replace(year=2101),
    ):
        envoyer_en_attente()
    etat = client_de(caissiere).get(ETAT).json()
    assert (etat["internet"], etat["en_attente"]) == ("en_ligne", 0)
    assert etat["derniere_tentative"].startswith("2101-01-01")
