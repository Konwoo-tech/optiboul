"""Désigner le valideur par son profil sur le poste de la caissière (#316)."""

import pytest
from django.urls import reverse

from optiboul.users.connexion import definir_code

from .test_demandes import emettre

pytestmark = pytest.mark.django_db


def _url(action, demande):
    return reverse(f"api:demande-{action}", kwargs={"pk": demande["id"]})


@pytest.fixture
def demande(client_de, caissiere, s44, type_essai, mama):
    return emettre(client_de(caissiere), mama.pk).json()


def _par_code(client, demande, profil, code):
    return client.post(
        _url("accorder", demande),
        {"code_gerant": {"profil": profil, "code": code}},
        format="json",
    )


def test_le_gerant_de_la_semaine(client_de, caissiere, gerant, demande, decisions):
    definir_code(gerant, "1234")
    faux = _par_code(client_de(caissiere), demande, "gerant", "0000")
    assert faux.json()["code"] == "code_incorrect"
    gerant.refresh_from_db()
    assert gerant.echecs_connexion == 1
    reponse = _par_code(client_de(caissiere), demande, "gerant", "1234")
    assert reponse.status_code == 200, reponse.content
    assert (reponse.json()["decide_par_nom"], reponse.json()["via"]) == (
        gerant.name,
        "code",
    )


def test_le_proprietaire(client_de, caissiere, proprietaire, demande, decisions):
    definir_code(proprietaire, "2222")
    reponse = _par_code(client_de(caissiere), demande, "proprietaire", "2222")
    assert reponse.json()["decide_par_nom"] == proprietaire.name


def test_pas_d_auto_validation(client_de, gerant, s44, type_essai, mama):
    definir_code(gerant, "1234")
    demande = emettre(client_de(gerant), mama.pk).json()
    reponse = _par_code(client_de(gerant), demande, "gerant", "1234")
    assert (reponse.status_code, reponse.json()["code"]) == (403, "droit_insuffisant")


def test_l_un_ou_l_autre(client_de, caissiere, gerant, demande):
    reponse = client_de(caissiere).post(
        _url("accorder", demande),
        {"code_gerant": {"profil": "gerant", "utilisateur": gerant.pk, "code": "1234"}},
        format="json",
    )
    assert reponse.status_code == 400


def test_valideurs_possibles(client_de, caissiere, gerant, proprietaire, demande):
    vue = client_de(caissiere).get(_url("detail", demande)).json()
    assert vue["valideurs_possibles"] == [
        {"profil": "gerant", "nom": gerant.name},
        {"profil": "proprietaire", "nom": proprietaire.name},
    ]


def test_l_emetteur_exclu(client_de, gerant, proprietaire, s44, type_essai, mama):
    demande = emettre(client_de(gerant), mama.pk).json()
    assert demande["valideurs_possibles"] == [
        {"profil": "proprietaire", "nom": proprietaire.name},
    ]
