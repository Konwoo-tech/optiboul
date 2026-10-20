import pytest
from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.users.models import Profil
from optiboul.users.models import User

pytestmark = pytest.mark.django_db


def test_les_groupes_de_depart_portent_un_profil():
    profils = Group.objects.values_list("profil_droits__profil", flat=True)
    assert sorted(profils) == sorted(
        [
            Profil.CAISSIER,
            Profil.CAISSIER,
            Profil.GERANT,
            Profil.PRODUCTION,
            Profil.PROPRIETAIRE,
            Profil.ADMINISTRATEUR,
        ],
    )


def test_le_profil_vient_du_groupe(user: User):
    assert user.profil is None
    user.groups.add(Group.objects.get(profil_droits__profil="production"))
    assert user.profil == Profil.PRODUCTION


def test_un_super_utilisateur_est_administrateur(admin_user: User):
    assert admin_user.profil == Profil.ADMINISTRATEUR


def test_l_api_renvoie_le_profil_de_l_utilisateur_connecte(user: User):
    user.groups.add(Group.objects.get(profil_droits__profil="gerant"))
    client = APIClient()
    client.force_authenticate(user)
    reponse = client.get(reverse("api:user-me"))
    assert reponse.json()["profil"] == "gerant"
