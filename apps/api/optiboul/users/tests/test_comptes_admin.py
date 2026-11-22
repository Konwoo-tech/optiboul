"""Comptes vus par l'administrateur (#355) : contact, activation, code, refus typés."""

import pytest
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.users.tests.factories import utilisateur_avec_profil

pytestmark = pytest.mark.django_db

COMPTES = reverse("api:utilisateur-list")


def _url(utilisateur, action=None):
    if action is None:
        return reverse("api:utilisateur-detail", kwargs={"pk": utilisateur.pk})
    return reverse(f"api:utilisateur-{action}", kwargs={"pk": utilisateur.pk})


def test_telephone_canal_et_dernier_acces(client_de, administrateur, caissiere):
    caissiere.telephone = "+237677412018"
    caissiere.canal_verification = "whatsapp"
    caissiere.last_login = timezone.now()
    caissiere.save()
    comptes = client_de(administrateur).get(COMPTES).json()["results"]
    rachel = next(c for c in comptes if c["id"] == caissiere.pk)
    assert rachel["telephone"] == "+237677412018"
    assert rachel["canal"] == "whatsapp"
    assert rachel["dernier_acces"] is not None
    assert (
        next(c for c in comptes if c["id"] == administrateur.pk)["dernier_acces"]
        is None
    )


def test_modifier_avec_nom(client_de, administrateur, caissiere):
    reponse = client_de(administrateur).patch(
        _url(caissiere),
        {"nom": "Rachel Nkoulou"},
        format="json",
    )
    assert reponse.status_code == 200
    assert reponse.json()["name"] == "Rachel Nkoulou"


def test_activation_desactive_puis_reactive(client_de, administrateur, caissiere):
    client = client_de(administrateur)
    reponse = client.post(
        _url(caissiere, "activation"),
        {"actif": False},
        format="json",
    )
    assert reponse.status_code == 200
    assert reponse.json()["is_active"] is False
    reponse = client.post(_url(caissiere, "activation"), {"actif": True}, format="json")
    assert reponse.json()["is_active"] is True
    actions = list(
        LigneJournal.objects.filter(objet_id=str(caissiere.pk))
        .order_by("id")
        .values_list("action", flat=True),
    )
    assert actions[-2:] == ["utilisateur.desactive", "utilisateur.reactive"]


def test_activation_refus(client_de, administrateur):
    client = client_de(administrateur)
    reponse = client.post(
        _url(administrateur, "activation"),
        {"actif": False},
        format="json",
    )
    assert (reponse.status_code, reponse.json()["code"]) == (409, "compte_propre")
    reponse = client.post(_url(administrateur, "activation"), {}, format="json")
    assert reponse.status_code == 400
    assert reponse.json()["erreurs"] == {"actif": "actif_invalide"}


def test_dernier_administrateur(client_de, administrateur):
    autre = utilisateur_avec_profil("administrateur", name="Second admin")
    reponse = client_de(autre).post(
        _url(administrateur, "activation"),
        {"actif": False},
        format="json",
    )
    assert reponse.status_code == 200
    reponse = client_de(autre).post(
        _url(autre, "activation"),
        {"actif": False},
        format="json",
    )
    assert reponse.json()["code"] == "compte_propre"


def test_reinitialiser_le_code_l_envoie_sans_le_montrer(
    client_de,
    administrateur,
    caissiere,
):
    caissiere.telephone = "+237677412018"
    caissiere.canal_verification = "sms"
    caissiere.save()
    reponse = client_de(administrateur).post(_url(caissiere, "reinitialiser-code"))
    assert reponse.status_code == 204
    assert reponse.content == b""
    caissiere.refresh_from_db()
    assert caissiere.code_pin
    message = MessageSortant.objects.get(destinataire="+237677412018")
    assert message.canal == "sms"
    assert "nouveau code du comptoir" in message.contenu
    ligne = LigneJournal.objects.get(action="utilisateur.code_reinitialise")
    assert ligne.apres == {"canal": "sms"}


def test_reinitialiser_sans_telephone(client_de, administrateur, caissiere):
    caissiere.telephone = ""
    caissiere.save()
    reponse = client_de(administrateur).post(_url(caissiere, "reinitialiser-code"))
    assert (reponse.status_code, reponse.json()["code"]) == (409, "telephone_absent")


def test_refus_de_creation_types(client_de, administrateur, caissiere):
    client = client_de(administrateur)
    reponse = client.post(COMPTES, {}, format="json")
    assert reponse.status_code == 400
    corps = reponse.json()
    assert corps["code"] == "champs_invalides"
    assert corps["erreurs"] == {
        "nom": "nom_obligatoire",
        "email": "email_invalide",
        "telephone": "telephone_invalide",
        "groupe": "groupe_obligatoire",
    }
    reponse = client.post(
        COMPTES,
        {
            "nom": "Doublon",
            "email": caissiere.email,
            "telephone": "12",
            "groupe": Group.objects.get(name="Production").pk,
        },
        format="json",
    )
    erreurs = reponse.json()["erreurs"]
    assert erreurs["telephone"] == "telephone_invalide"
    assert erreurs["email"] in {"email_deja_utilise", "email_invalide"}


def test_refus_de_modification_types(client_de, administrateur, caissiere):
    reponse = client_de(administrateur).patch(
        _url(caissiere),
        {"nom": "  ", "telephone": "abc"},
        format="json",
    )
    assert reponse.status_code == 400
    assert reponse.json()["erreurs"] == {
        "nom": "nom_obligatoire",
        "telephone": "telephone_invalide",
    }


@pytest.mark.parametrize("profil", ["proprietaire", "gerant", "caissiere"])
def test_administrateur_seul(client_de, request, profil, caissiere):
    client = client_de(request.getfixturevalue(profil))
    assert client.post(_url(caissiere, "activation"), {"actif": False}).status_code in {
        403,
        404,
    }
    assert client.post(_url(caissiere, "reinitialiser-code")).status_code in {403, 404}
