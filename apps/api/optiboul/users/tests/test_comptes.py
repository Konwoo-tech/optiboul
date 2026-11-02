import re

import pytest
from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.users import mfa
from optiboul.users.domain.comptes import CompteInvalide
from optiboul.users.domain.comptes import apercu
from optiboul.users.domain.comptes import normaliser_gmail
from optiboul.users.domain.comptes import normaliser_telephone
from optiboul.users.models import User

UTILISATEURS = reverse("api:utilisateur-list")
APERCU = reverse("api:utilisateur-apercu")
INVITATION = reverse("api:connexion-invitation")


@pytest.mark.parametrize(
    ("saisi", "attendu"),
    [
        ("677412018", "677412018"),
        ("+237 6 77 41 20 18", "677412018"),
        ("00237-677-41-20-18", "677412018"),
    ],
)
def test_telephone_camerounais(saisi, attendu):
    assert normaliser_telephone(saisi) == attendu


@pytest.mark.parametrize(
    "saisi",
    ["277412018", "67741201", "6774120189", "+33 6 12 34 56 78"],
)
def test_telephone_refuse(saisi):
    with pytest.raises(CompteInvalide):
        normaliser_telephone(saisi)


def test_seuls_les_gmail_sont_acceptes():
    assert normaliser_gmail(" Willy.Ngono@Gmail.com ") == "willy.ngono@gmail.com"
    with pytest.raises(CompteInvalide):
        normaliser_gmail("willy@yahoo.fr")


def test_apercu_des_acces():
    assert apercu("caissier")["espaces"] == ["comptoir"]
    assert apercu("caissier")["accueil"] == "/comptoir"
    assert apercu("gerant")["espaces"] == ["gestion", "comptoir", "atelier"]
    assert "Sauvegardes et restauration" in apercu("administrateur")["fonctions"]


@pytest.fixture
def admin_client(client_de, administrateur) -> APIClient:
    return client_de(administrateur)


def _groupe(nom: str) -> int:
    return Group.objects.get(name=nom).pk


@pytest.mark.django_db
def test_apercu_selon_le_groupe_choisi(admin_client):
    reponse = admin_client.post(
        APERCU,
        {"groupe": _groupe("Production")},
        format="json",
    )
    assert reponse.json()["profil"] == "production"
    assert reponse.json()["espaces"] == ["atelier"]


@pytest.mark.django_db
def test_creer_un_compte_en_trois_etapes(admin_client):
    reponse = admin_client.post(
        UTILISATEURS,
        {
            "nom": "Davy",
            "email": "Davy.Caisse@gmail.com",
            "telephone": "+237 6 99 00 11 22",
            "groupe": _groupe("Production"),
            "canal": "whatsapp",
            "code": "2468",
        },
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    corps = reponse.json()
    assert corps["email"] == "davy.caisse@gmail.com"
    assert corps["profil"] == "production"
    assert len(corps["codesSecours"]) == 10

    davy = User.objects.get(email="davy.caisse@gmail.com")
    assert davy.telephone == "699001122"
    assert davy.canal_verification == "whatsapp"
    assert not davy.has_usable_password()
    assert davy.code_pin
    assert mfa.etat(davy)["codesSecoursRestants"] == 10
    invitation = MessageSortant.objects.get(canal="email")
    assert invitation.destinataire == "davy.caisse@gmail.com"
    assert "/connexion/invitation?uid=" in invitation.contenu
    assert MessageSortant.objects.get(canal="whatsapp").destinataire == "699001122"
    trace = LigneJournal.objects.get(action="utilisateur.cree")
    assert (trace.apres or {})["groupe"] == "Production"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("champ", "valeur"),
    [
        ("email", "davy@yahoo.fr"),
        ("telephone", "77412018"),
        ("groupe", None),
    ],
)
def test_champs_obligatoires_et_formats(admin_client, champ, valeur):
    donnees = {
        "nom": "Davy",
        "email": "davy@gmail.com",
        "telephone": "699001122",
        "groupe": _groupe("Production"),
    }
    donnees[champ] = valeur
    reponse = admin_client.post(UTILISATEURS, donnees, format="json")
    assert reponse.status_code == 400
    assert champ in reponse.json()
    assert not User.objects.filter(email="davy@gmail.com").exists()


@pytest.mark.django_db
def test_gmail_unique(admin_client, gerant):
    gerant.email = "willy@gmail.com"
    gerant.save()
    reponse = admin_client.post(
        UTILISATEURS,
        {
            "nom": "Autre Willy",
            "email": "WILLY@gmail.com",
            "telephone": "699001122",
            "groupe": _groupe("Production"),
        },
        format="json",
    )
    assert reponse.status_code == 400
    assert "déjà un compte" in reponse.json()["email"][0]


@pytest.mark.django_db
def test_l_invitation_permet_de_choisir_son_mot_de_passe(admin_client):
    admin_client.post(
        UTILISATEURS,
        {
            "nom": "Davy",
            "email": "davy@gmail.com",
            "telephone": "699001122",
            "groupe": _groupe("Production"),
        },
        format="json",
    )
    contenu = MessageSortant.objects.get(canal="email").contenu
    trouve = re.search(r"uid=([^&\s]+)&jeton=(\S+)", contenu)
    assert trouve is not None
    uid, jeton = trouve.groups()
    anonyme = APIClient()
    faible = anonyme.post(
        INVITATION,
        {"uid": uid, "jeton": jeton, "motDePasse": "1234"},
        format="json",
    )
    assert faible.json()["code"] == "mot_de_passe_faible"
    donnees = {"uid": uid, "jeton": jeton, "motDePasse": "Pain-de-mie-2026"}
    assert anonyme.post(INVITATION, donnees, format="json").status_code == 204
    assert User.objects.get(email="davy@gmail.com").check_password("Pain-de-mie-2026")
    # Le lien ne sert qu'une fois.
    assert (
        anonyme.post(INVITATION, donnees, format="json").json()["code"]
        == "invitation_invalide"
    )


@pytest.mark.django_db
def test_l_administrateur_definit_le_code(admin_client, caissiere):
    url = reverse("api:utilisateur-code", kwargs={"pk": caissiere.pk})
    assert admin_client.post(url, {"code": "12a4"}, format="json").status_code == 400
    assert admin_client.post(url, {"code": "1357"}, format="json").status_code == 204
    caissiere.refresh_from_db()
    assert caissiere.code_pin
    assert LigneJournal.objects.filter(action="utilisateur.code_defini").count() == 1


@pytest.mark.django_db
def test_reserve_a_l_administrateur(client_de, proprietaire):
    assert (
        client_de(proprietaire).post(UTILISATEURS, {}, format="json").status_code == 403
    )
