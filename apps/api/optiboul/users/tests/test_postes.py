from typing import Any

import pytest
from django.core import signing
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users import postes
from optiboul.users.models import PosteConfiance

pytestmark = pytest.mark.django_db

LISTE = reverse("api:poste-list")
ACTUEL = reverse("api:poste-actuel")


def _enregistrer(client: APIClient, nom: str = "Comptoir") -> Any:
    reponse = client.post(LISTE, {"nom": nom}, format="json")
    assert reponse.status_code == 201, reponse.content
    return reponse


def test_l_administrateur_enregistre_ce_navigateur(administrateur):
    client = APIClient()
    client.force_authenticate(administrateur)
    reponse = _enregistrer(client)
    cookie = reponse.cookies[postes.COOKIE]
    assert cookie["httponly"]
    assert cookie["samesite"] == "Strict"
    poste = PosteConfiance.objects.get()
    # Seule l'empreinte est en base : le jeton n'y figure pas.
    jeton = signing.Signer(salt="optiboul.poste-de-confiance").unsign(cookie.value)
    assert poste.empreinte == postes.empreinte(jeton)
    assert jeton not in poste.empreinte
    assert LigneJournal.objects.get().action == "poste.enregistre"

    anonyme = APIClient()
    anonyme.cookies[postes.COOKIE] = cookie.value
    assert anonyme.get(ACTUEL).json()["poste"]["nom"] == "Comptoir"


def test_jeton_falsifie_ou_inconnu_ignore():
    client = APIClient()
    assert client.get(ACTUEL).json() == {"poste": None}
    client.cookies[postes.COOKIE] = "faux:jeton"
    assert client.get(ACTUEL).json() == {"poste": None}
    client.cookies[postes.COOKIE] = signing.Signer(
        salt="optiboul.poste-de-confiance",
    ).sign(
        "inconnu",
    )
    assert client.get(ACTUEL).json() == {"poste": None}


def test_poste_revoque_n_est_plus_reconnu(administrateur):
    admin = APIClient()
    admin.force_authenticate(administrateur)
    cookie = _enregistrer(admin).cookies[postes.COOKIE].value
    poste = PosteConfiance.objects.get()
    reponse = admin.post(reverse("api:poste-revoquer", kwargs={"pk": poste.pk}))
    assert reponse.json()["actif"] is False
    poste.refresh_from_db()
    assert poste.revoque_par == administrateur
    assert LigneJournal.objects.filter(action="poste.revoque").count() == 1

    comptoir = APIClient()
    comptoir.cookies[postes.COOKIE] = cookie
    assert comptoir.get(ACTUEL).json() == {"poste": None}


def test_cookie_ignore_depuis_l_entree_distante(administrateur):
    admin = APIClient()
    admin.force_authenticate(administrateur)
    cookie = _enregistrer(admin).cookies[postes.COOKIE].value
    distant = APIClient(HTTP_X_OPTIBOUL_ENTREE="distante")
    distant.cookies[postes.COOKIE] = cookie
    assert distant.get(ACTUEL).json() == {"poste": None}


def test_pas_d_enregistrement_a_distance(administrateur):
    client = APIClient(HTTP_X_OPTIBOUL_ENTREE="distante")
    client.force_authenticate(administrateur)
    assert client.post(LISTE, {"nom": "Téléphone"}, format="json").status_code == 403


@pytest.mark.parametrize("profil", ["gerant", "proprietaire", "caissiere"])
def test_reserve_a_l_administrateur(client_de, request, profil):
    client = client_de(request.getfixturevalue(profil))
    assert client.get(LISTE).status_code == 403
    assert client.post(LISTE, {"nom": "X"}, format="json").status_code == 403
