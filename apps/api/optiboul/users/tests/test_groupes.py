# ruff: noqa: RUF001 : noms des groupes du cahier des charges, avec leur tiret
import pytest
from django.contrib.auth.models import Group
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal

pytestmark = pytest.mark.django_db

GROUPES = reverse("api:groupe-list")
MOI = reverse("api:user-me")


def test_les_six_groupes_de_depart(client_de, administrateur):
    noms = [g["nom"] for g in client_de(administrateur).get(GROUPES).json()["results"]]
    assert noms == [
        "Caisse – équipe de jour",
        "Caisse – équipe de nuit",
        "Direction",
        "Gérants de la semaine",
        "Production",
        "Support informatique",
    ]


def test_creer_un_groupe_trace(client_de, administrateur):
    client = client_de(administrateur)
    reponse = client.post(
        GROUPES,
        {"nom": "Caisse – renfort", "profil": "caissier", "description": "Week-ends"},
        format="json",
    )
    assert reponse.status_code == 201
    assert reponse.json() | {"id": 0} == {
        "id": 0,
        "nom": "Caisse – renfort",
        "profil": "caissier",
        "description": "Week-ends",
        "membres": 0,
        "protege": False,
    }
    assert (
        client.post(
            GROUPES,
            {"nom": "caisse – RENFORT", "profil": "caissier"},
        ).status_code
        == 400
    )
    trace = LigneJournal.objects.get(action="groupe.cree")
    assert trace.apres == {
        "nom": "Caisse – renfort",
        "profil": "caissier",
        "description": "Week-ends",
    }


def test_modifier_un_groupe(client_de, administrateur):
    groupe = Group.objects.get(name="Production")
    url = reverse("api:groupe-detail", kwargs={"pk": groupe.pk})
    reponse = client_de(administrateur).patch(
        url,
        {"description": "Atelier"},
        format="json",
    )
    assert reponse.json()["description"] == "Atelier"
    trace = LigneJournal.objects.get(action="groupe.modifie")
    assert trace.avant == {
        "nom": "Production",
        "profil": "production",
        "description": "",
    }
    assert trace.apres == {
        "nom": "Production",
        "profil": "production",
        "description": "Atelier",
    }


def test_changer_de_groupe_a_un_effet_immediat_et_trace(
    client_de,
    administrateur,
    caissiere,
):
    client_caissiere = client_de(caissiere)
    assert client_caissiere.get(MOI).json()["profil"] == "caissier"
    gerants = Group.objects.get(name="Gérants de la semaine")
    url = reverse("api:utilisateur-groupe", kwargs={"pk": caissiere.pk})
    reponse = client_de(administrateur).post(url, {"groupe": gerants.pk}, format="json")
    assert reponse.json()["profil"] == "gerant"
    assert reponse.json()["groupe"] == gerants.pk
    # Même session, requête suivante : les droits ont déjà changé.
    assert client_caissiere.get(MOI).json()["profil"] == "gerant"
    assert caissiere.groups.count() == 1
    trace = LigneJournal.objects.get(action="utilisateur.groupe_change")
    assert trace.avant == {"groupe": "Caisse – équipe de nuit", "profil": "caissier"}
    assert trace.apres == {"groupe": "Gérants de la semaine", "profil": "gerant"}
    assert trace.acteur == administrateur


@pytest.mark.parametrize("profil", ["proprietaire", "gerant"])
def test_reserve_a_l_administrateur(client_de, request, profil):
    assert client_de(request.getfixturevalue(profil)).get(GROUPES).status_code == 403
