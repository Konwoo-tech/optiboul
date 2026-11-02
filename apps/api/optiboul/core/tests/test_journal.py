import pytest
from django.db import DatabaseError
from django.db import transaction
from django.urls import reverse

from optiboul.core.application.journal import Auteur
from optiboul.core.application.journal import Entree
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.models import LigneJournal

pytestmark = pytest.mark.django_db

URL = reverse("api:journal-list")


def _auteur(utilisateur, **champs) -> Auteur:
    return Auteur(
        utilisateur_id=utilisateur.pk,
        nom=utilisateur.name,
        profil=utilisateur.profil,
        **champs,
    )


def test_une_action_est_tracee_avec_avant_apres(gerant):
    journaliser(
        "caisse.rouverte",
        auteur=_auteur(gerant, poste="Comptoir", entree=Entree.LOCALE),
        objet_type="caisse",
        objet_id=12,
        avant={"statut": "FERMEE"},
        apres={"statut": "ROUVERTE", "motif": "Erreur de comptage"},
    )
    ligne = LigneJournal.objects.get()
    assert ligne.acteur == gerant
    assert ligne.acteur_nom == "Willy"
    assert ligne.profil == "gerant"
    assert ligne.poste_nom == "Comptoir"
    assert ligne.objet_id == "12"
    assert ligne.avant == {"statut": "FERMEE"}
    assert ligne.apres == {"statut": "ROUVERTE", "motif": "Erreur de comptage"}


def test_le_journal_refuse_modification_et_suppression(gerant):
    journaliser("semaine.ouverte", auteur=_auteur(gerant))
    ligne = LigneJournal.objects.get()
    with (
        pytest.raises(DatabaseError, match="journal en ajout seul"),
        transaction.atomic(),
    ):
        LigneJournal.objects.filter(pk=ligne.pk).update(action="effacee")
    with (
        pytest.raises(DatabaseError, match="journal en ajout seul"),
        transaction.atomic(),
    ):
        ligne.delete()
    assert LigneJournal.objects.get().action == "semaine.ouverte"


def test_filtres_auteur_type_et_periode(client_de, proprietaire, gerant, caissiere):
    journaliser(
        "caisse.ouverte",
        auteur=_auteur(caissiere),
        objet_type="caisse",
        objet_id=1,
    )
    journaliser(
        "semaine.ouverte",
        auteur=_auteur(gerant),
        objet_type="semaine",
        objet_id=42,
    )
    journaliser("connexion.echec", auteur=_auteur(caissiere))
    client = client_de(proprietaire)

    tout = client.get(URL).json()["results"]
    assert [ligne["action"] for ligne in tout] == [
        "connexion.echec",
        "semaine.ouverte",
        "caisse.ouverte",
    ]
    par_auteur = client.get(URL, {"auteur": caissiere.pk}).json()["results"]
    assert {ligne["action"] for ligne in par_auteur} == {
        "caisse.ouverte",
        "connexion.echec",
    }
    assert [
        ligne["action"]
        for ligne in client.get(URL, {"type": "semaine"}).json()["results"]
    ] == [
        "semaine.ouverte",
    ]
    assert [
        ligne["action"]
        for ligne in client.get(URL, {"type": "connexion"}).json()["results"]
    ] == [
        "connexion.echec",
    ]
    assert (
        client.get(URL, {"du": "2000-01-01", "au": "2000-01-31"}).json()["results"]
        == []
    )
    assert client.get(URL, {"du": "hier"}).status_code == 400


@pytest.mark.parametrize("profil", ["caissiere", "responsable_production"])
def test_reserve_a_la_direction_et_a_l_administrateur(
    client_de,
    request,
    profil,
    administrateur,
):
    assert client_de(request.getfixturevalue(profil)).get(URL).status_code == 403
    assert client_de(None).get(URL).status_code == 403
    assert client_de(administrateur).get(URL).status_code == 200


def test_aucune_ecriture_par_l_api(client_de, proprietaire):
    assert client_de(proprietaire).post(URL, {"action": "x"}).status_code == 405
