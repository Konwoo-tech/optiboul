"""Restaurer une sauvegarde depuis l'API (#304, #359) : synchrone, une à la fois."""

import base64
import os
from pathlib import Path
from typing import Any
from unittest import mock

import pytest
from django.core.cache import cache
from django.urls import reverse

from optiboul.core.api.sauvegardes import restaurer_sauvegarde
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut
from optiboul.core.infrastructure import restauration
from optiboul.core.infrastructure import restaurations
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.restauration import CONTROLES
from optiboul.core.infrastructure.restauration import RapportEssai
from optiboul.core.infrastructure.restauration import RestaurationImpossible
from optiboul.core.infrastructure.restauration import essayer
from optiboul.core.infrastructure.sauvegardes import PgDump

pytestmark = pytest.mark.django_db

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


def _restaurer(client, sauvegarde_id, cle="cle-1", corps=None):
    entetes = {"HTTP_IDEMPOTENCY_KEY": cle} if cle else {}
    return client.post(
        reverse("api:sauvegarde-restaurer", args=[sauvegarde_id]),
        corps or {},
        format="json",
        **entetes,
    )


@pytest.fixture
def simuler(copie):
    """Essai, copie de sûreté, remplacement et totaux simulés ; `apres` réglable."""
    reglages: dict[str, Any] = {"apres": TOTAUX, "remplacer": None}

    def remplacer(fichier):
        if reglages["remplacer"] is not None:
            raise reglages["remplacer"]
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
        mock.patch.object(restaurations, "remplacer", side_effect=remplacer),
        mock.patch.object(
            restaurations,
            "totaux_de_la_base",
            side_effect=lambda: reglages["apres"],
        ),
    ):
        yield reglages


def test_restauration_synchrone_et_controles(client_de, administrateur, copie, simuler):
    client = client_de(administrateur)
    reponse = _restaurer(client, copie.pk)
    assert reponse.status_code == 200, reponse.json()
    corps = reponse.json()
    assert corps["controles"] == [
        {"cle": "sessions", "ok": True, "avant": 14, "apres": 14},
        {"cle": "soldes_clients", "ok": True, "avant": 14050, "apres": 14050},
        {"cle": "stocks", "ok": True, "avant": 9, "apres": 9},
    ]
    avant = corps["copie_avant"]
    assert (avant["genre"], avant["declencheur"], avant["statut"]) == (
        "avant_restauration",
        "avant_restauration",
        "reussie",
    )
    assert Path(avant["emplacement"]).name.startswith("avant-restauration-")
    # La copie de sûreté est réinscrite sous l'identifiant annoncé.
    assert corps["restauration"]["copie_de_surete"] == avant["id"]
    assert corps["restauration"]["statut"] == "terminee"
    suivi = client.get(
        reverse("api:sauvegarde-restauration", args=[corps["restauration"]["id"]]),
    ).json()
    assert suivi["statut"] == "terminee"
    ligne = LigneJournal.objects.get(action="sauvegarde.restauree")
    assert ligne.acteur_id == administrateur.pk
    assert (ligne.apres or {})["conforme"] is True
    # Le verrou est libéré : une autre restauration peut suivre.
    assert cache.get(restaurations.CLE_VERROU) is None


def test_meme_cle_rejoue_la_reponse(client_de, administrateur, copie, simuler):
    client = client_de(administrateur)
    premiere = _restaurer(client, copie.pk, cle="double-clic")
    seconde = _restaurer(client, copie.pk, cle="double-clic")
    assert seconde.status_code == 200
    assert seconde.headers["Idempotent-Replayed"] == "true"
    assert seconde.json() == premiere.json()
    assert LigneJournal.objects.filter(action="sauvegarde.restauree").count() == 1


def test_totaux_differents_signales(client_de, administrateur, copie, simuler):
    simuler["apres"] = {**TOTAUX, "stocks": 8}
    corps = _restaurer(client_de(administrateur), copie.pk).json()
    stocks = next(c for c in corps["controles"] if c["cle"] == "stocks")
    assert stocks == {"cle": "stocks", "ok": False, "avant": 9, "apres": 8}


def test_echec_laisse_la_base_et_libere_le_verrou(
    client_de,
    administrateur,
    copie,
    simuler,
):
    simuler["remplacer"] = RestaurationImpossible("pg_restore: archive illisible")
    reponse = _restaurer(client_de(administrateur), copie.pk)
    assert reponse.status_code == 409
    corps = reponse.json()
    assert corps["code"] == "restauration_impossible"
    assert "archive illisible" in corps["detail"]
    assert corps["restauration"]["statut"] == "echec"
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


def test_la_sequence_suit_la_copie_reinscrite(administrateur, copie, simuler):
    etat = restaurations.commencer(copie, restaurations.Auteur(administrateur.pk))
    assert etat is not None
    restaurations.executer(etat["id"])
    suivante = Sauvegarde.objects.create(
        genre=Genre.LOCALE,
        declencheur=Declencheur.MANUELLE,
        statut=Statut.EN_COURS,
    )
    assert suivante.pk > etat["copie_de_surete"]


def test_une_seule_restauration_a_la_fois(client_de, administrateur, copie):
    assert restaurations.commencer(copie, restaurations.Auteur(None)) is not None
    reponse = _restaurer(client_de(administrateur), copie.pk)
    assert (reponse.status_code, reponse.json()["code"]) == (
        409,
        "restauration_en_cours",
    )


def test_erreurs(client_de, administrateur, copie):
    client = client_de(administrateur)
    reponse = _restaurer(client, copie.pk, cle="")
    assert (reponse.status_code, reponse.json()["code"]) == (
        400,
        "cle_idempotence_absente",
    )
    reponse = _restaurer(client, copie.pk, corps={"confirmation": "oui"})
    assert (reponse.status_code, reponse.json()["code"]) == (
        400,
        "confirmation_invalide",
    )
    reponse = _restaurer(client, 999_999)
    assert (reponse.status_code, reponse.json()["code"]) == (404, "sauvegarde_inconnue")
    cloud = Sauvegarde.objects.create(
        genre=Genre.CLOUD,
        declencheur=Declencheur.PLANIFIEE,
        statut=Statut.REUSSIE,
        emplacement="s3://optiboul/copie.dump.chiffre",
    )
    reponse = _restaurer(client, cloud.pk)
    assert (reponse.status_code, reponse.json()["code"]) == (
        409,
        "restauration_impossible",
    )
    Path(copie.emplacement).unlink()
    assert _restaurer(client, copie.pk).json()["code"] == "restauration_impossible"
    reponse = client.get(reverse("api:sauvegarde-restauration", args=[424242]))
    assert (reponse.status_code, reponse.json()["code"]) == (
        404,
        "restauration_inconnue",
    )
    assert not Sauvegarde.objects.filter(genre=Genre.AVANT_RESTAURATION).exists()


@pytest.mark.parametrize("profil", ["proprietaire", "gerant", "caissiere"])
def test_administrateur_seul(client_de, request, profil, copie):
    client = client_de(request.getfixturevalue(profil))
    assert _restaurer(client, copie.pk).status_code == 403


def test_la_vue_ne_tient_pas_de_transaction():
    """Sous ATOMIC_REQUESTS, une transaction ouverte bloquerait pg_restore."""
    assert getattr(restaurer_sauvegarde, "_non_atomic_requests", set())


def test_les_totaux_controles_sont_lus_dans_la_copie(tmp_path):
    chemin = tmp_path / "vraie.dump"
    PgDump().exporter(chemin)
    totaux = essayer(chemin).totaux
    assert set(totaux) == set(CONTROLES)
    assert restauration.totaux_de_la_base() == totaux
