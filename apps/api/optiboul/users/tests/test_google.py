from unittest import mock

import pytest
import requests
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal

GOOGLE = reverse("api:connexion-google")
CLIENT_GOOGLE = "optiboul.apps.googleusercontent.com"

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _client_google(settings):
    settings.OPTIBOUL_GOOGLE_CLIENT_ID = CLIENT_GOOGLE


@pytest.fixture
def mireille(caissiere):
    caissiere.email = "mireille.ngo@gmail.com"
    caissiere.save()
    return caissiere


def _google_repond(email: str, statut: int = 200, **autres) -> mock.Mock:
    reponse = mock.Mock(status_code=statut)
    reponse.json.return_value = {
        "aud": CLIENT_GOOGLE,
        "iss": "https://accounts.google.com",
        "email": email,
        "email_verified": "true",
    } | autres
    return reponse


def _connexion(reponse: mock.Mock):
    with mock.patch("optiboul.users.google.requests.get", return_value=reponse):
        return APIClient().post(GOOGLE, {"jeton": "jeton-google"}, format="json")


def test_gmail_enregistre_puis_double_authentification(mireille):
    reponse = _connexion(_google_repond(mireille.email.upper()))
    assert reponse.status_code == 200
    assert reponse.json()["deuxFacteurs"] is True
    assert reponse.json()["via"] == "Google"


def test_gmail_non_enregistre_refuse(db):
    reponse = _connexion(_google_repond("inconnu@gmail.com"))
    assert reponse.status_code == 403
    assert reponse.json()["code"] == "compte_inconnu"
    trace = LigneJournal.objects.get(action="connexion.google_refusee")
    assert trace.apres == {"email": "inconnu@gmail.com"}


def test_compte_desactive_refuse(mireille):
    mireille.is_active = False
    mireille.save()
    assert _connexion(_google_repond(mireille.email)).json()["code"] == (
        "compte_inconnu"
    )


@pytest.mark.parametrize(
    "reponse",
    [
        _google_repond("x@gmail.com", statut=400),
        _google_repond("x@gmail.com", aud="autre-application"),
        _google_repond("x@gmail.com", iss="pirate.example"),
        _google_repond("x@gmail.com", email_verified="false"),
        _google_repond("x@entreprise.cm"),
    ],
)
def test_jeton_refuse(reponse, db):
    assert _connexion(reponse).json()["code"] == "google_invalide"


def test_google_injoignable(db):
    with mock.patch(
        "optiboul.users.google.requests.get",
        side_effect=requests.ConnectionError,
    ):
        reponse = APIClient().post(GOOGLE, {"jeton": "jeton"}, format="json")
    assert reponse.status_code == 503
    assert reponse.json()["code"] == "google_indisponible"


def test_desactivee_sans_identifiant_client(settings, mireille):
    settings.OPTIBOUL_GOOGLE_CLIENT_ID = ""
    assert _connexion(_google_repond(mireille.email)).json()["code"] == (
        "google_indisponible"
    )
