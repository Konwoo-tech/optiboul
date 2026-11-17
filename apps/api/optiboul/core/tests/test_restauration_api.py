"""Restaurer une sauvegarde depuis l'API (#304)."""

import base64
import os
from pathlib import Path
from unittest import mock

import pytest
from django.core.cache import cache
from django.urls import reverse

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut
from optiboul.core.infrastructure import restauration
from optiboul.core.infrastructure import restaurations
from optiboul.core.infrastructure import tasks
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.restauration import CONTROLES
from optiboul.core.infrastructure.restauration import RapportEssai
from optiboul.core.infrastructure.restauration import RestaurationImpossible
from optiboul.core.infrastructure.restauration import essayer
from optiboul.core.infrastructure.sauvegardes import PgDump

pytestmark = pytest.mark.django_db

CONFIRMER = {"confirmation": "RESTAURER"}
TOTAUX = {"sessions": 14, "soldes_clients": 14050, "stocks": 9}


@pytest.fixture(autouse=True)
def _reglages(settings, tmp_path):
    settings.OPTIBOUL_DOSSIER_SAUVEGARDES = str(tmp_path / "sauvegardes")
    settings.OPTIBOUL_CLE_SAUVEGARDE = base64.urlsafe_b64encode(os.urandom(32)).decode()
    (tmp_path / "sauvegardes").mkdir()
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def copie(tmp_path):
    chemin = tmp_path / "sauvegardes" / "optiboul-20261116-100000-manuelle.dump"
    chemin.write_bytes(b"PGDMP copie de test")
    return Sauvegarde.objects.create(
        genre=Genre.LOCALE,
        declencheur=Declencheur.MANUELLE,
        statut=Statut.REUSSIE,
        emplacement=str(chemin),
        taille=chemin.stat().st_size,
    )


def _faux_pg_dump(self, chemin: Path) -> int:
    chemin.write_bytes(b"PGDMP copie de surete")
    return chemin.stat().st_size


def _restaurer(client, sauvegarde_id, corps=CONFIRMER):
    return client.post(
        reverse("api:sauvegarde-restaurer", args=[sauvegarde_id]),
        corps,
        format="json",
    )


def _suivre(client, numero):
    return client.get(reverse("api:sauvegarde-restauration", args=[numero]))


def _lancer(client, copie, capture):
    with mock.patch.object(tasks.restaurer, "delay") as delay, capture(execute=True):
        reponse = _restaurer(client, copie.pk)
    assert reponse.status_code == 202, reponse.json()
    numero = reponse.json()["restauration"]["id"]
    delay.assert_called_once_with(numero)
    return reponse.json()["restauration"]


def test_demande_puis_restauration_et_controles(
    client_de,
    administrateur,
    copie,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    lancee = _lancer(client, copie, django_capture_on_commit_callbacks)
    surete = Sauvegarde.objects.get(pk=lancee["copie_de_surete"])
    assert surete.genre == Genre.AVANT_RESTAURATION
    assert lancee | {"debut": None} == {
        "id": lancee["id"],
        "statut": "en_cours",
        "sauvegarde": copie.pk,
        "copie_de_surete": surete.pk,
        "controles": None,
        "erreur": "",
        "debut": None,
        "fin": None,
    }
    assert LigneJournal.objects.filter(
        action="sauvegarde.restauration_demandee",
    ).exists()

    def base_remplacee(fichier):
        # La base restaurée date d'avant la demande : la copie de sûreté n'y est pas.
        assert fichier == Path(copie.emplacement)
        Sauvegarde.objects.filter(genre=Genre.AVANT_RESTAURATION).delete()

    with (
        mock.patch.object(
            restaurations,
            "essayer",
            return_value=RapportEssai({}, TOTAUX),
        ),
        mock.patch.object(PgDump, "exporter", _faux_pg_dump),
        mock.patch.object(restaurations, "remplacer", side_effect=base_remplacee),
        mock.patch.object(restaurations, "totaux_de_la_base", return_value=TOTAUX),
    ):
        assert tasks.restaurer(lancee["id"]) == "terminee"

    suivi = _suivre(client, lancee["id"]).json()
    assert suivi["statut"] == "terminee"
    assert suivi["fin"] is not None
    assert suivi["controles"] == {
        "sessions": {"avant": 14, "apres": 14},
        "soldes_clients": {"avant": 14050, "apres": 14050},
        "stocks": {"avant": 9, "apres": 9},
    }
    # La copie de sûreté est réinscrite sous le même identifiant, réussie.
    surete = Sauvegarde.objects.get(pk=lancee["copie_de_surete"])
    assert surete.statut == Statut.REUSSIE
    assert Path(surete.emplacement).name.startswith("avant-restauration-")
    ligne = LigneJournal.objects.get(action="sauvegarde.restauree")
    assert ligne.acteur_id == administrateur.pk
    assert (ligne.apres or {})["conforme"] is True
    # Le verrou est libéré : une autre restauration peut suivre.
    assert restaurations.commencer(copie, restaurations.Auteur(None)) is not None


def test_la_sequence_suit_la_copie_reinscrite(administrateur, copie):
    etat = restaurations.commencer(copie, restaurations.Auteur(administrateur.pk))
    assert etat is not None
    with (
        mock.patch.object(restaurations, "essayer", return_value=RapportEssai({}, {})),
        mock.patch.object(PgDump, "exporter", _faux_pg_dump),
        mock.patch.object(
            restaurations,
            "remplacer",
            side_effect=lambda _: Sauvegarde.objects.filter(
                pk=etat["copie_de_surete"],
            ).delete(),
        ),
        mock.patch.object(restaurations, "totaux_de_la_base", return_value={}),
    ):
        restaurations.executer(etat["id"])
    suivante = Sauvegarde.objects.create(
        genre=Genre.LOCALE,
        declencheur=Declencheur.MANUELLE,
        statut=Statut.EN_COURS,
    )
    assert suivante.pk > etat["copie_de_surete"]


def test_echec_laisse_la_base_et_libere_le_verrou(
    client_de,
    administrateur,
    copie,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    lancee = _lancer(client, copie, django_capture_on_commit_callbacks)
    with (
        mock.patch.object(restaurations, "essayer", return_value=RapportEssai({}, {})),
        mock.patch.object(PgDump, "exporter", _faux_pg_dump),
        mock.patch.object(
            restaurations,
            "remplacer",
            side_effect=RestaurationImpossible("pg_restore: archive illisible"),
        ),
    ):
        assert tasks.restaurer(lancee["id"]) == "echec"
    suivi = _suivre(client, lancee["id"]).json()
    assert suivi["statut"] == "echec"
    assert suivi["erreur"] == "pg_restore: archive illisible"
    assert suivi["controles"] is None
    assert LigneJournal.objects.filter(action="sauvegarde.restauration_echec").exists()
    assert cache.get(restaurations.CLE_VERROU) is None


def test_fichier_illisible_abandonne_la_copie_de_surete(administrateur, copie):
    etat = restaurations.commencer(copie, restaurations.Auteur(administrateur.pk))
    assert etat is not None
    with mock.patch.object(
        restaurations,
        "essayer",
        side_effect=RestaurationImpossible("Fichier modifié ou tronqué."),
    ):
        restaurations.executer(etat["id"])
    assert Sauvegarde.objects.get(pk=etat["copie_de_surete"]).statut == Statut.ECHEC


def test_une_seule_restauration_a_la_fois(
    client_de,
    administrateur,
    copie,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    _lancer(client, copie, django_capture_on_commit_callbacks)
    reponse = _restaurer(client, copie.pk)
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "restauration_en_cours"


def test_erreurs(client_de, administrateur, copie, tmp_path):
    client = client_de(administrateur)
    reponse = _restaurer(client, copie.pk, {"confirmation": "oui"})
    assert reponse.status_code == 400
    assert reponse.json()["code"] == "confirmation_invalide"
    assert _restaurer(client, copie.pk, {}).status_code == 400
    reponse = _restaurer(client, 999_999)
    assert reponse.status_code == 404
    assert reponse.json()["code"] == "sauvegarde_inconnue"
    cloud = Sauvegarde.objects.create(
        genre=Genre.CLOUD,
        declencheur=Declencheur.PLANIFIEE,
        statut=Statut.REUSSIE,
        emplacement="s3://optiboul/copie.dump.chiffre",
    )
    reponse = _restaurer(client, cloud.pk)
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "sauvegarde_non_restaurable"
    Path(copie.emplacement).unlink()
    assert _restaurer(client, copie.pk).json()["code"] == "sauvegarde_non_restaurable"
    reponse = _suivre(client, 424242)
    assert reponse.status_code == 404
    assert reponse.json()["code"] == "restauration_inconnue"
    assert not Sauvegarde.objects.filter(genre=Genre.AVANT_RESTAURATION).exists()


@pytest.mark.parametrize("profil", ["proprietaire", "gerant", "caissiere"])
def test_administrateur_seul(client_de, request, profil, copie):
    client = client_de(request.getfixturevalue(profil))
    assert _restaurer(client, copie.pk).status_code == 403
    assert _suivre(client, 1).status_code == 403


def test_les_totaux_controles_sont_lus_dans_la_copie(tmp_path):
    chemin = tmp_path / "vraie.dump"
    PgDump().exporter(chemin)
    totaux = essayer(chemin).totaux
    assert set(totaux) == set(CONTROLES)
    assert restauration.totaux_de_la_base() == totaux
