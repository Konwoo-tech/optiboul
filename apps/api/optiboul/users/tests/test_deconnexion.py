import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal

DECONNEXION = reverse("api:connexion-deconnexion")
MOI = reverse("api:user-me")

pytestmark = pytest.mark.django_db


def _connecte(utilisateur) -> APIClient:
    """Une vraie session : la déconnexion doit la fermer."""
    client = APIClient()
    client.force_login(utilisateur)
    return client


def test_deconnexion_volontaire_par_defaut(caissiere):
    client = _connecte(caissiere)
    assert client.post(DECONNEXION).status_code == 204
    assert LigneJournal.objects.filter(action="connexion.fermee").exists()
    assert client.get(MOI).status_code == 403


def test_deconnexion_pour_inactivite(caissiere):
    client = _connecte(caissiere)
    reponse = client.post(DECONNEXION, {"raison": "inactivite"}, format="json")
    assert reponse.status_code == 204
    assert LigneJournal.objects.filter(action="connexion.expiree").exists()
    assert not LigneJournal.objects.filter(action="connexion.fermee").exists()
    assert client.get(MOI).status_code == 403


def test_raison_inconnue(caissiere):
    client = _connecte(caissiere)
    reponse = client.post(DECONNEXION, {"raison": "panne"}, format="json")
    assert (reponse.status_code, reponse.json()["code"]) == (400, "raison_invalide")
    assert client.get(MOI).status_code == 200


def test_sans_session(client_de):
    assert (
        client_de(None).post(DECONNEXION, {"raison": "inactivite"}).status_code == 204
    )
    assert not LigneJournal.objects.exists()


def test_moi_porte_id_et_email(client_de, caissiere):
    corps = client_de(caissiere).get(MOI).json()
    assert (corps["id"], corps["email"]) == (caissiere.pk, caissiere.email)
    assert corps["profil"] == "caissier"
