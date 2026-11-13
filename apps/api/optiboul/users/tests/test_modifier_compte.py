"""Modifier, désactiver et réactiver un compte (#302)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users.tests.factories import utilisateur_avec_profil

pytestmark = pytest.mark.django_db


def _url(utilisateur):
    return reverse("api:utilisateur-detail", kwargs={"pk": utilisateur.pk})


def test_modifier_nom_telephone_canal(client_de, administrateur, caissiere):
    reponse = client_de(administrateur).patch(
        _url(caissiere),
        {"name": "Rachel Nkoulou", "telephone": "677000004", "canal": "sms"},
        format="json",
    )
    assert reponse.status_code == 200, reponse.content
    caissiere.refresh_from_db()
    assert (caissiere.name, caissiere.telephone, caissiere.canal_verification) == (
        "Rachel Nkoulou",
        "677000004",
        "sms",
    )
    trace = LigneJournal.objects.get(action="utilisateur.modifie")
    assert (trace.apres or {}).get("name") == "Rachel Nkoulou"


def test_desactiver_coupe_la_session(client_de, administrateur, caissiere):
    session = APIClient()
    session.force_login(caissiere)
    assert session.get(reverse("api:user-me")).status_code == 200
    reponse = client_de(administrateur).patch(
        _url(caissiere),
        {"is_active": False},
        format="json",
    )
    assert reponse.json()["is_active"] is False
    assert session.get(reverse("api:user-me")).status_code == 403
    assert LigneJournal.objects.filter(action="utilisateur.desactive").exists()
    client_de(administrateur).patch(_url(caissiere), {"is_active": True}, format="json")
    assert LigneJournal.objects.filter(action="utilisateur.reactive").exists()


def test_ni_soi_meme_ni_le_dernier_administrateur(client_de, administrateur):
    reponse = client_de(administrateur).patch(
        _url(administrateur),
        {"is_active": False},
        format="json",
    )
    assert (reponse.status_code, reponse.json()["code"]) == (409, "compte_propre")


def test_dernier_administrateur(client_de, administrateur):
    autre = utilisateur_avec_profil("administrateur", name="Second")
    reponse = client_de(autre).patch(
        _url(administrateur),
        {"is_active": False},
        format="json",
    )
    assert reponse.status_code == 200
    # Autre administrateur seul actif : le désactiver laisserait l'application sans.
    administrateur.is_active = True
    administrateur.save()
    client_de(administrateur).patch(_url(autre), {"is_active": False}, format="json")
    dernier = client_de(autre).patch(
        _url(administrateur),
        {"is_active": False},
        format="json",
    )
    assert dernier.json()["code"] == "dernier_administrateur"


def test_telephone_invalide(client_de, administrateur, caissiere):
    reponse = client_de(administrateur).patch(
        _url(caissiere),
        {"telephone": "12"},
        format="json",
    )
    assert (reponse.status_code, reponse.json()["code"]) == (400, "champs_invalides")
    assert "telephone" in reponse.json()["champs"]


def test_reserve_a_l_administrateur(client_de, gerant, caissiere):
    assert (
        client_de(gerant).patch(_url(caissiere), {}, format="json").status_code == 403
    )
