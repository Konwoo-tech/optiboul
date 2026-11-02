import pytest
from allauth.mfa.totp.internal.auth import hotp_value
from allauth.mfa.totp.internal.auth import yield_hotp_counters_from_time
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users import connexion
from optiboul.users import postes
from optiboul.users.tests.factories import poste_de_confiance

pytestmark = pytest.mark.django_db

MFA = reverse("api:mfa-list")
PREPARER = reverse("api:mfa-preparer-totp")
ACTIVER = reverse("api:mfa-activer-totp")
CODES = reverse("api:mfa-codes-secours")
CONNEXION_CODE = reverse("api:connexion-code")
CONNEXION_TOTP = reverse("api:connexion-totp")
MOI = reverse("api:user-me")


def code_totp(secret: str) -> str:
    """Code du moment, comme l'afficherait Google Authenticator."""
    compteur = next(iter(yield_hotp_counters_from_time()))
    return f"{hotp_value(secret, compteur):06d}"


@pytest.fixture
def connecte(gerant) -> APIClient:
    client = APIClient()
    client.force_authenticate(gerant)
    return client


def test_activer_le_totp_donne_dix_codes_de_secours(connecte):
    assert connecte.get(MFA).json() == {"totp": False, "codesSecoursRestants": 0}
    preparation = connecte.post(PREPARER).json()
    assert preparation["uri"].startswith("otpauth://totp/")
    assert "issuer=OptiBoul" in preparation["uri"]
    faux = connecte.post(ACTIVER, {"code": "000000"}, format="json")
    assert faux.status_code == 400
    reponse = connecte.post(
        ACTIVER,
        {"code": code_totp(preparation["secret"])},
        format="json",
    )
    codes = reponse.json()["codesSecours"]
    assert len(codes) == 10
    assert len(set(codes)) == 10
    assert connecte.get(MFA).json() == {"totp": True, "codesSecoursRestants": 10}
    assert LigneJournal.objects.filter(action="mfa.totp_active").count() == 1


def test_regenerer_les_codes_annule_les_anciens(connecte, gerant):
    from optiboul.users import mfa  # noqa: PLC0415

    anciens = connecte.post(CODES).json()["codesSecours"]
    nouveaux = connecte.post(CODES).json()["codesSecours"]
    assert set(anciens).isdisjoint(nouveaux)
    assert mfa.verifier_second_facteur(gerant, anciens[0]) is None
    assert mfa.verifier_second_facteur(gerant, nouveaux[0]) == "secours"


@pytest.fixture
def comptoir_gerant(gerant) -> APIClient:
    connexion.definir_code(gerant, "1234")
    client = APIClient()
    client.cookies[postes.COOKIE] = poste_de_confiance()
    reponse = client.post(
        CONNEXION_CODE,
        {"utilisateur": gerant.pk, "code": "1234"},
        format="json",
    )
    assert reponse.json()["deuxFacteurs"] is True
    return client


def test_connexion_sans_reseau_par_code_de_secours_a_usage_unique(
    gerant,
    comptoir_gerant,
):
    from optiboul.core.application.journal import SYSTEME  # noqa: PLC0415
    from optiboul.users import mfa  # noqa: PLC0415

    codes = mfa.regenerer_codes(gerant, SYSTEME)
    reponse = comptoir_gerant.post(CONNEXION_TOTP, {"code": codes[0]}, format="json")
    assert reponse.status_code == 204
    assert comptoir_gerant.get(MOI).json()["profil"] == "gerant"
    trace = LigneJournal.objects.get(action="connexion.reussie")
    assert trace.apres == {"methode": "code", "verification": "secours"}
    # Le code est consommé.
    assert mfa.verifier_second_facteur(gerant, codes[0]) is None
    assert mfa.etat(gerant)["codesSecoursRestants"] == 9


def test_connexion_par_application_d_authentification(gerant, comptoir_gerant):
    from allauth.mfa.totp.internal.auth import TOTP  # noqa: PLC0415
    from allauth.mfa.totp.internal.auth import generate_totp_secret  # noqa: PLC0415

    secret = generate_totp_secret()
    TOTP.activate(gerant, secret)
    assert comptoir_gerant.post(
        CONNEXION_TOTP,
        {"code": "000000"},
        format="json",
    ).json()["code"] in {"code_incorrect"}
    reponse = comptoir_gerant.post(
        CONNEXION_TOTP,
        {"code": code_totp(secret)},
        format="json",
    )
    assert reponse.status_code == 204


def test_cinq_codes_faux_bloquent(gerant, comptoir_gerant):
    reponses = [
        comptoir_gerant.post(CONNEXION_TOTP, {"code": "999999"}, format="json").json()[
            "code"
        ]
        for _ in range(5)
    ]
    assert reponses == ["code_incorrect"] * 4 + ["compte_bloque"]


def test_reserve_aux_personnes_connectees():
    assert APIClient().get(MFA).status_code == 403
