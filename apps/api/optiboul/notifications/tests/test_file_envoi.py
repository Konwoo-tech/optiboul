from datetime import timedelta

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.domain.envois import TENTATIVES_MAX
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.domain.envois import delai_avant_nouvel_essai
from optiboul.notifications.infrastructure.envois import file_envoi
from optiboul.notifications.infrastructure.models import MessageSortant

ENVOIS = reverse("api:envoi-list")


def test_delai_croissant_plafonne():
    assert [delai_avant_nouvel_essai(n).total_seconds() for n in (1, 2, 3)] == [
        30,
        60,
        120,
    ]
    assert delai_avant_nouvel_essai(20) == timedelta(hours=1)


pytestmark = pytest.mark.django_db


def test_la_file_et_ses_etats(client_de, administrateur, caissiere):
    file_envoi.mettre_en_file(Canal.WHATSAPP, "677412018", "Bon n° 1")
    file_envoi.mettre_en_file(Canal.EMAIL, "fotso@gmail.com", "Rapport", "Passation")
    assert client_de(caissiere).get(ENVOIS).status_code == 403
    reponse = client_de(administrateur).get(ENVOIS, {"canal": "whatsapp"})
    assert reponse.status_code == 200
    message = reponse.json()["results"][0]
    assert (message["statut"], message["destinataire"]) == (
        "en_attente",
        "+237 6 •• •• 20 18",
    )
    courriel = client_de(administrateur).get(ENVOIS, {"canal": "email"}).json()
    assert courriel["results"][0]["destinataire"] == "fotso@gmail.com"


def test_relancer_un_echec(client_de, gerant):
    file_envoi.mettre_en_file(Canal.SMS, "699001122", "Code 123456")
    message = MessageSortant.objects.get()
    message.statut, message.tentatives = "echec", TENTATIVES_MAX
    message.save()
    url = reverse("api:envoi-relancer", kwargs={"pk": message.pk})
    reponse = client_de(gerant).post(url)
    assert reponse.status_code == 200
    assert (reponse.json()["statut"], reponse.json()["tentatives"]) == ("en_attente", 0)
    assert LigneJournal.objects.filter(action="envoi.relance").exists()
    deja = client_de(gerant).post(url)
    assert deja.json()["code"] == "envoi_non_en_echec"
