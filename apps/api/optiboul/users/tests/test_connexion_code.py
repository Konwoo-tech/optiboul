from unittest import mock

import pytest
from django.contrib.auth.hashers import check_password
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users import connexion
from optiboul.users import postes
from optiboul.users.tests.factories import poste_de_confiance
from optiboul.users.verrouillage import LimiteParPoste

pytestmark = pytest.mark.django_db

UTILISATEURS = reverse("api:connexion-utilisateurs")
CODE = reverse("api:connexion-code")
MOI = reverse("api:user-me")


@pytest.fixture
def comptoir() -> APIClient:
    client = APIClient()
    client.cookies[postes.COOKIE] = poste_de_confiance()
    return client


@pytest.fixture
def rachel(caissiere):
    connexion.definir_code(caissiere, "4821")
    return caissiere


def test_liste_des_utilisateurs_du_poste(comptoir, rachel, gerant):
    connexion.definir_code(gerant, "1234")
    reponse = comptoir.get(UTILISATEURS)
    assert reponse.status_code == 200
    assert [(p["nom"], p["profil"]) for p in reponse.json()] == [
        ("Rachel", "caissier"),
        ("Willy", "gerant"),
    ]
    assert "csrftoken" in reponse.cookies


def test_sans_poste_de_confiance_pas_de_liste_ni_de_code(rachel):
    client = APIClient()
    assert client.get(UTILISATEURS).json()["code"] == "poste_non_reconnu"
    reponse = client.post(
        CODE,
        {"utilisateur": rachel.pk, "code": "4821"},
        format="json",
    )
    assert reponse.status_code == 403


def test_code_refuse_a_distance(comptoir, rachel):
    comptoir.credentials(HTTP_X_OPTIBOUL_ENTREE="distante")
    reponse = comptoir.post(
        CODE,
        {"utilisateur": rachel.pk, "code": "4821"},
        format="json",
    )
    assert reponse.status_code == 403
    assert reponse.json()["code"] == "code_interdit_a_distance"


def test_bon_code_ouvre_la_session(comptoir, rachel):
    reponse = comptoir.post(
        CODE,
        {"utilisateur": rachel.pk, "code": "4821"},
        format="json",
    )
    assert reponse.status_code == 200
    assert reponse.json() == {"deuxFacteurs": False}
    assert comptoir.get(MOI).json()["profil"] == "caissier"
    ligne = LigneJournal.objects.get(action="connexion.reussie")
    assert ligne.acteur == rachel
    assert ligne.poste_nom == "Comptoir"
    assert ligne.apres == {"methode": "code", "verification": ""}


def test_le_code_est_hache(rachel):
    # Argon2 en production ; les tests utilisent un hachage rapide.
    assert "4821" not in rachel.code_pin
    assert check_password("4821", rachel.code_pin)


def test_cinq_codes_faux_bloquent_quinze_minutes_et_sont_traces(comptoir, rachel):
    for restants in [4, 3, 2, 1]:
        reponse = comptoir.post(
            CODE,
            {"utilisateur": rachel.pk, "code": "0000"},
            format="json",
        )
        assert reponse.status_code == 400
        assert reponse.json() == {
            "detail": "Code incorrect.",
            "code": "code_incorrect",
            "essaisRestants": restants,
        }
    reponse = comptoir.post(
        CODE,
        {"utilisateur": rachel.pk, "code": "0000"},
        format="json",
    )
    assert reponse.status_code == 403
    assert reponse.json()["code"] == "compte_bloque"
    # Même le bon code est refusé pendant le blocage.
    reponse = comptoir.post(
        CODE,
        {"utilisateur": rachel.pk, "code": "4821"},
        format="json",
    )
    assert reponse.json()["code"] == "compte_bloque"
    assert LigneJournal.objects.filter(action="connexion.echec").count() == 5
    assert LigneJournal.objects.filter(action="connexion.verrouillage").count() == 1


def test_trop_de_tentatives_par_poste(comptoir, rachel):
    with mock.patch.object(LimiteParPoste, "rate", "3/min", create=True):
        statuts = [
            comptoir.post(
                CODE,
                {"utilisateur": rachel.pk, "code": "0000"},
                format="json",
            ).status_code
            for _ in range(4)
        ]
    assert statuts == [400, 400, 400, 429]


def test_csrf_exige(rachel):
    client = APIClient(enforce_csrf_checks=True)
    client.cookies[postes.COOKIE] = poste_de_confiance("Comptoir 2")
    reponse = client.post(
        CODE,
        {"utilisateur": rachel.pk, "code": "4821"},
        format="json",
    )
    assert reponse.status_code == 403
    assert "CSRF" in reponse.json()["detail"]
