import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Semaine
from optiboul.users.tests.factories import utilisateur_avec_profil

pytestmark = pytest.mark.django_db

LISTE = reverse("api:semaine-list")
ROTATION = reverse("api:semaine-rotation")


def _action(semaine_id: int, nom: str) -> str:
    return reverse(f"api:semaine-{nom}", kwargs={"pk": semaine_id})


@pytest.fixture
def equipe(gerant, responsable_production):
    patrick = utilisateur_avec_profil("gerant", name="Patrick")
    ignace = utilisateur_avec_profil("production", name="Ignace")
    return {
        "willy": gerant,
        "patrick": patrick,
        "serge": responsable_production,
        "ignace": ignace,
    }


def _planifier(client, numero: int, gerant=None, production=None):
    return client.post(
        LISTE,
        {
            "annee": 2026,
            "numero": numero,
            "gerant": gerant.pk if gerant else None,
            "production": production.pk if production else None,
        },
        format="json",
    )


def test_le_proprietaire_planifie_une_semaine(client_de, proprietaire, equipe):
    reponse = _planifier(client_de(proprietaire), 44, equipe["willy"], equipe["serge"])
    assert reponse.status_code == 201, reponse.content
    semaine = reponse.json()["semaine"]
    assert semaine["code"] == "S44"
    assert (semaine["du"], semaine["au"]) == ("2026-10-26", "2026-11-01")
    assert semaine["statut"] == "planifiee"
    assert semaine["gerant"]["nom"] == "Willy"
    assert semaine["production"]["nom"] == "Serge"
    assert semaine["planifiee_par"] == "Fotso"
    assert reponse.json()["conflits"] == []
    assert LigneJournal.objects.get(action="semaine.planifiee").acteur == proprietaire


def test_une_seule_planification_par_semaine(client_de, proprietaire):
    client = client_de(proprietaire)
    _planifier(client, 44)
    reponse = _planifier(client, 44)
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "semaine_existante"


def test_le_profil_doit_correspondre_au_role(client_de, proprietaire, equipe):
    reponse = _planifier(client_de(proprietaire), 44, equipe["serge"], equipe["serge"])
    assert reponse.status_code == 400
    assert reponse.json() == {
        "detail": "Cette personne n'a pas le profil gérant.",
        "code": "profil_inadapte",
        "role": "gerant",
    }


def test_numero_de_semaine_impossible(client_de, proprietaire):
    assert (
        _planifier(client_de(proprietaire), 53).status_code == 201
    )  # 2026 a 53 semaines
    reponse = client_de(proprietaire).post(
        LISTE,
        {"annee": 2027, "numero": 53},
        format="json",
    )
    assert reponse.status_code == 400


def test_rotation_proposee_et_conflit_signale(client_de, proprietaire, equipe):
    client = client_de(proprietaire)
    _planifier(client, 43, equipe["patrick"], equipe["ignace"])
    proposee = client.get(ROTATION, {"annee": 2026, "numero": 44}).json()
    # Ordre alphabétique : Patrick → Willy, Ignace → Serge.
    assert proposee == {"gerant": equipe["willy"].pk, "production": equipe["serge"].pk}

    reponse = _planifier(client, 44, equipe["patrick"], equipe["serge"])
    assert reponse.json()["conflits"] == ["gerant_deux_semaines_de_suite"]


def test_copier_la_semaine_precedente(client_de, proprietaire, equipe):
    client = client_de(proprietaire)
    _planifier(client, 43, equipe["willy"], equipe["serge"])
    s44 = _planifier(client, 44).json()["semaine"]["id"]
    reponse = client.post(_action(s44, "copier-precedente"))
    assert reponse.json()["semaine"]["gerant"]["nom"] == "Willy"
    assert reponse.json()["conflits"] == [
        "gerant_deux_semaines_de_suite",
        "production_deux_semaines_de_suite",
    ]
    trace = LigneJournal.objects.get(action="semaine.affectations")
    assert trace.avant == {"gerant": None, "production": None}

    seule = _planifier(client, 30).json()["semaine"]["id"]
    assert client.post(_action(seule, "copier-precedente")).json()["code"] == (
        "pas_de_semaine_precedente"
    )


def test_changer_les_affectations(client_de, proprietaire, equipe):
    client = client_de(proprietaire)
    s44 = _planifier(client, 44, equipe["willy"], equipe["serge"]).json()["semaine"][
        "id"
    ]
    reponse = client.post(
        _action(s44, "affectations"),
        {"gerant": equipe["patrick"].pk, "production": None},
        format="json",
    )
    assert reponse.json()["semaine"]["gerant"]["nom"] == "Patrick"
    assert reponse.json()["semaine"]["production"] is None
    Semaine.objects.filter(pk=s44).update(statut="cloturee")
    reponse = client.post(
        _action(s44, "affectations"),
        {"gerant": None, "production": None},
        format="json",
    )
    assert reponse.json()["code"] == "semaine_cloturee"


def test_tout_le_monde_voit_seul_le_proprietaire_planifie(
    client_de,
    proprietaire,
    caissiere,
    gerant,
):
    _planifier(client_de(proprietaire), 44)
    assert len(client_de(caissiere).get(LISTE).json()["results"]) == 1
    assert _planifier(client_de(gerant), 45).status_code == 403
    assert client_de(None).get(LISTE).status_code == 403
