import re
from datetime import UTC
from datetime import datetime
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.users import connexion
from optiboul.users import postes
from optiboul.users.domain.double_auth import double_auth_requise
from optiboul.users.domain.double_auth import renvoi_dans
from optiboul.users.models import CodeVerification
from optiboul.users.tests.factories import poste_de_confiance

pytestmark = pytest.mark.django_db

CODE = reverse("api:connexion-code")
EMAIL = reverse("api:connexion-email")
ENVOYER = reverse("api:connexion-otp-envoyer")
VERIFIER = reverse("api:connexion-otp-verifier")
ANNULER = reverse("api:connexion-annuler")
MOI = reverse("api:user-me")

MIDI = datetime(2026, 10, 28, 11, 0, tzinfo=UTC)  # 12:00 à Yaoundé


@pytest.mark.parametrize(
    ("via", "profil", "distante", "derniere", "requise"),
    [
        ("code", "caissier", False, None, False),
        ("code", "production", False, None, False),
        ("code", "gerant", False, None, True),
        (
            "code",
            "gerant",
            False,
            MIDI - timedelta(hours=5),
            False,
        ),  # 07:00 le même jour
        ("code", "gerant", False, MIDI - timedelta(hours=13), True),  # 23:00 la veille
        ("code", "proprietaire", False, None, True),
        ("e-mail", "caissier", False, MIDI, True),
        ("Google", "proprietaire", False, MIDI, True),
        ("code", "caissier", True, None, True),
    ],
)
def test_quand_la_double_authentification_est_requise(
    via,
    profil,
    distante,
    derniere,
    requise,
):
    assert (
        double_auth_requise(
            via=via,
            profil=profil,
            distante=distante,
            derniere=derniere,
            maintenant=MIDI,
        )
        is requise
    )


def test_renvoi_apres_30_secondes():
    assert renvoi_dans(None, MIDI) == 0
    assert renvoi_dans(MIDI, MIDI) == 30
    assert renvoi_dans(MIDI - timedelta(seconds=29.5), MIDI) == 1
    assert renvoi_dans(MIDI - timedelta(seconds=30), MIDI) == 0


@pytest.fixture
def comptoir() -> APIClient:
    client = APIClient()
    client.cookies[postes.COOKIE] = poste_de_confiance()
    return client


@pytest.fixture
def willy(gerant):
    gerant.telephone = "677412018"
    gerant.save()
    connexion.definir_code(gerant, "1234")
    return gerant


def _code_envoye() -> str:
    message = MessageSortant.objects.order_by("-id").first()
    assert message is not None
    trouve = re.search(r"\b(\d{6})\b", message.contenu)
    assert trouve is not None
    return trouve.group(1)


def test_premiere_connexion_du_jour_du_gerant(comptoir, willy):
    reponse = comptoir.post(
        CODE,
        {"utilisateur": willy.pk, "code": "1234"},
        format="json",
    )
    corps = reponse.json()
    assert corps["deuxFacteurs"] is True
    assert corps["telephoneMasque"] == "+237 6 •• •• 20 18"
    assert corps["utilisateur"]["profil"] == "gerant"
    assert "677412018" not in reponse.content.decode()
    # Pas encore connecté.
    assert comptoir.get(MOI).status_code == 403

    envoi = comptoir.post(ENVOYER, {"canal": "sms"}, format="json").json()
    assert envoi["canal"] == "sms"
    assert envoi["renvoiDans"] == 30
    message = MessageSortant.objects.get()
    assert message.canal == "sms"
    assert message.destinataire == "677412018"

    assert (
        comptoir.post(VERIFIER, {"code": _code_envoye()}, format="json").status_code
        == 204
    )
    assert comptoir.get(MOI).json()["profil"] == "gerant"
    willy.refresh_from_db()
    assert willy.derniere_double_auth is not None
    trace = LigneJournal.objects.get(action="connexion.reussie")
    assert trace.apres == {"methode": "code", "verification": "sms"}

    # Même jour : le code suffit.
    autre = APIClient()
    autre.cookies[postes.COOKIE] = comptoir.cookies[postes.COOKIE].value
    reponse = autre.post(CODE, {"utilisateur": willy.pk, "code": "1234"}, format="json")
    assert reponse.json() == {"deuxFacteurs": False}


def test_trois_essais_puis_nouveau_code(comptoir, willy):
    comptoir.post(CODE, {"utilisateur": willy.pk, "code": "1234"}, format="json")
    comptoir.post(ENVOYER, {"canal": "whatsapp"}, format="json")
    bon = _code_envoye()
    faux = "000000" if bon != "000000" else "111111"
    reponses = [
        comptoir.post(VERIFIER, {"code": faux}, format="json").json() for _ in range(3)
    ]
    assert [(r["code"], r["essaisRestants"]) for r in reponses] == [
        ("code_incorrect", 2),
        ("code_incorrect", 1),
        ("trop_d_essais", 0),
    ]
    # Même le bon code ne passe plus : il faut en demander un autre.
    assert (
        comptoir.post(VERIFIER, {"code": bon}, format="json").json()["code"]
        == "trop_d_essais"
    )
    CodeVerification.objects.update(cree_le=timezone.now() - timedelta(seconds=31))
    comptoir.post(ENVOYER, {"canal": "whatsapp"}, format="json")
    assert (
        comptoir.post(VERIFIER, {"code": _code_envoye()}, format="json").status_code
        == 204
    )


def test_renvoi_trop_tot_mais_bascule_de_canal_possible(comptoir, willy):
    comptoir.post(CODE, {"utilisateur": willy.pk, "code": "1234"}, format="json")
    comptoir.post(ENVOYER, {"canal": "sms"}, format="json")
    trop_tot = comptoir.post(ENVOYER, {"canal": "sms"}, format="json")
    assert trop_tot.status_code == 429
    assert trop_tot.json()["code"] == "renvoi_trop_tot"
    bascule = comptoir.post(ENVOYER, {"canal": "whatsapp"}, format="json")
    assert bascule.status_code == 200
    # L'ancien code ne vaut plus rien.
    assert CodeVerification.objects.filter(utilise=False).count() == 1


def test_code_expire(comptoir, willy):
    comptoir.post(CODE, {"utilisateur": willy.pk, "code": "1234"}, format="json")
    comptoir.post(ENVOYER, {"canal": "sms"}, format="json")
    code = _code_envoye()
    CodeVerification.objects.update(expire_le=timezone.now() - timedelta(seconds=1))
    assert (
        comptoir.post(VERIFIER, {"code": code}, format="json").json()["code"]
        == "code_expire"
    )


def test_sans_identification_ni_code(comptoir, willy):
    assert comptoir.post(ENVOYER, {"canal": "sms"}, format="json").status_code == 409
    comptoir.post(CODE, {"utilisateur": willy.pk, "code": "1234"}, format="json")
    assert comptoir.post(VERIFIER, {"code": "123456"}, format="json").status_code == 409
    comptoir.post(ANNULER)
    assert comptoir.post(ENVOYER, {"canal": "sms"}, format="json").status_code == 409


def test_connexion_par_email_toujours_en_deux_etapes(caissiere):
    caissiere.set_password("Boulangerie-2026")
    caissiere.telephone = "699000111"
    caissiere.save()
    client = APIClient()
    reponse = client.post(
        EMAIL,
        {"email": caissiere.email, "motDePasse": "Boulangerie-2026"},
        format="json",
    )
    assert reponse.json()["deuxFacteurs"] is True
    assert reponse.json()["via"] == "e-mail"
    client.post(ENVOYER, {"canal": "sms"}, format="json")
    assert (
        client.post(VERIFIER, {"code": _code_envoye()}, format="json").status_code
        == 204
    )
    assert client.get(MOI).json()["profil"] == "caissier"


def test_mot_de_passe_faux_compte_et_bloque(caissiere):
    client = APIClient()
    for _ in range(4):
        reponse = client.post(
            EMAIL,
            {"email": caissiere.email, "motDePasse": "x"},
            format="json",
        )
        assert reponse.json()["code"] == "identifiants_incorrects"
    reponse = client.post(
        EMAIL,
        {"email": caissiere.email, "motDePasse": "x"},
        format="json",
    )
    assert reponse.json()["code"] == "compte_bloque"
    inconnu = client.post(
        EMAIL,
        {"email": "inconnu@gmail.com", "motDePasse": "x"},
        format="json",
    )
    assert inconnu.json()["code"] == "identifiants_incorrects"


def test_sans_numero_le_code_ne_part_pas(comptoir, gerant):
    connexion.definir_code(gerant, "1234")
    comptoir.post(CODE, {"utilisateur": gerant.pk, "code": "1234"}, format="json")
    reponse = comptoir.post(ENVOYER, {"canal": "sms"}, format="json")
    assert reponse.json()["code"] == "telephone_absent"
