"""Thème et langue mémorisés par utilisateur (US-004, #347)."""

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal

pytestmark = pytest.mark.django_db

MOI = reverse("api:user-me")


def test_par_defaut_auto_et_francais(client_de, caissiere):
    moi = client_de(caissiere).get(MOI).json()
    assert (moi["theme"], moi["langue"]) == ("auto", "fr")


@pytest.mark.parametrize(
    "profil",
    ["caissiere", "responsable_production", "gerant", "proprietaire", "administrateur"],
)
def test_chacun_change_ses_preferences(client_de, request, profil):
    personne = request.getfixturevalue(profil)
    client = client_de(personne)
    reponse = client.patch(MOI, {"theme": "sombre"}, format="json")
    assert reponse.status_code == 200
    assert (reponse.json()["theme"], reponse.json()["langue"]) == ("sombre", "fr")
    reponse = client.patch(MOI, {"langue": "en"}, format="json")
    assert (reponse.json()["theme"], reponse.json()["langue"]) == ("sombre", "en")
    personne.refresh_from_db()
    assert (personne.theme, personne.langue) == ("sombre", "en")
    lignes = LigneJournal.objects.filter(
        action="utilisateur.preferences",
        objet_id=str(personne.pk),
    )
    assert lignes.count() == 2


def test_preferences_de_chacun(client_de, caissiere, gerant):
    client_de(caissiere).patch(MOI, {"theme": "clair"}, format="json")
    assert client_de(gerant).get(MOI).json()["theme"] == "auto"


def test_valeur_inconnue_et_champs_proteges(client_de, caissiere):
    client = client_de(caissiere)
    assert client.patch(MOI, {"theme": "rose"}, format="json").status_code == 400
    assert client.patch(MOI, {"langue": "de"}, format="json").status_code == 400
    reponse = client.patch(MOI, {"name": "Autre", "theme": "clair"}, format="json")
    assert reponse.status_code == 200
    caissiere.refresh_from_db()
    assert caissiere.name == "Rachel"
    assert not LigneJournal.objects.filter(
        action="utilisateur.preferences",
        apres__theme="rose",
    ).exists()


def test_rien_ne_change_rien_au_journal(client_de, caissiere):
    client_de(caissiere).patch(MOI, {"theme": "auto"}, format="json")
    assert not LigneJournal.objects.filter(action="utilisateur.preferences").exists()


def test_anonyme_refuse(client_de):
    assert client_de(None).patch(
        MOI,
        {"theme": "sombre"},
        format="json",
    ).status_code in {
        401,
        403,
    }
