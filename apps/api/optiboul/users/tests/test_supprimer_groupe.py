"""Supprimer un groupe (#303) : vide, créé par l'administrateur, tracé."""

import pytest
from django.contrib.auth.models import Group
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal

pytestmark = pytest.mark.django_db

GROUPES = reverse("api:groupe-list")


def _groupe(pk):
    return reverse("api:groupe-detail", args=[pk])


def _creer(client, nom="Renfort du week-end"):
    reponse = client.post(GROUPES, {"nom": nom, "profil": "caissier"}, format="json")
    assert reponse.status_code == 201
    return reponse.json()


def test_supprimer_un_groupe_vide(client_de, administrateur):
    client = client_de(administrateur)
    groupe = _creer(client)
    assert groupe["protege"] is False
    assert client.delete(_groupe(groupe["id"])).status_code == 204
    assert not Group.objects.filter(pk=groupe["id"]).exists()
    ligne = LigneJournal.objects.get(action="groupe.supprime")
    assert ligne.objet_id == str(groupe["id"])
    assert ligne.avant == {
        "nom": "Renfort du week-end",
        "profil": "caissier",
        "description": "",
    }
    assert client.delete(_groupe(groupe["id"])).status_code == 404


def test_un_groupe_avec_des_membres_reste(client_de, administrateur, caissiere):
    client = client_de(administrateur)
    groupe = _creer(client)
    caissiere.groups.set([groupe["id"]])
    reponse = client.delete(_groupe(groupe["id"]))
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "groupe_non_vide"
    assert reponse.json()["membres"] == 1
    assert Group.objects.filter(pk=groupe["id"]).exists()


def test_les_groupes_de_depart_sont_proteges(client_de, administrateur):
    client = client_de(administrateur)
    groupes = client.get(GROUPES).json()["results"]
    assert {g["protege"] for g in groupes} == {True}
    vide = next(g for g in groupes if g["nom"] == "Direction")
    Group.objects.get(pk=vide["id"]).user_set.clear()
    reponse = client.delete(_groupe(vide["id"]))
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "groupe_protege"
    assert not LigneJournal.objects.filter(action="groupe.supprime").exists()


@pytest.mark.parametrize("profil", ["proprietaire", "gerant", "caissiere"])
def test_administrateur_seul(client_de, request, administrateur, profil):
    groupe = _creer(client_de(administrateur))
    client = client_de(request.getfixturevalue(profil))
    assert client.delete(_groupe(groupe["id"])).status_code == 403
