"""Restauration d'une sauvegarde depuis l'API (#304), une seule à la fois.

La restauration remplace toute la base, y compris ce qu'elle aurait écrit d'elle-même :
son état vit donc dans le cache (Redis en production), partagé par l'API et le
travailleur Celery. Une fois la base remplacée, la copie de sûreté et l'entrée du
journal sont réécrites dans la base restaurée.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from dataclasses import replace
from pathlib import Path
from typing import Any

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management.color import no_style
from django.db import connection
from django.utils import timezone

from optiboul.core.application.journal import Auteur
from optiboul.core.application.journal import Entree
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut

from .journal import journaliser
from .models import Sauvegarde
from .restauration import DELAI
from .restauration import essayer
from .restauration import remplacer
from .restauration import totaux_de_la_base
from .sauvegardes import PgDump
from .sauvegardes import depot_sauvegardes
from .sauvegardes import dossier_sauvegardes

logger = logging.getLogger(__name__)

EN_COURS = "en_cours"
TERMINEE = "terminee"
ECHEC = "echec"

CLE_VERROU = "optiboul:restauration:en-cours"
CLE_NUMERO = "optiboul:restauration:numero"
CONSERVATION = 30 * 24 * 3600  # l'état d'une restauration reste lisible 30 jours
# Essai, copie de sûreté et restauration : chacun borné par DELAI.
DUREE_DU_VERROU = 3 * DELAI


def _cle(numero: int) -> str:
    return f"optiboul:restauration:{numero}"


def lire(numero: int) -> dict[str, Any] | None:
    return cache.get(_cle(numero))


def _ecrire(etat: dict[str, Any]) -> None:
    cache.set(_cle(etat["id"]), etat, CONSERVATION)


def _numero_suivant() -> int:
    cache.add(CLE_NUMERO, 0, None)
    return cache.incr(CLE_NUMERO)


def restaurable(sauvegarde: Sauvegarde) -> bool:
    """Une copie locale réussie, encore présente sur le disque du serveur."""
    return (
        sauvegarde.genre in {Genre.LOCALE, Genre.AVANT_RESTAURATION}
        and sauvegarde.statut == Statut.REUSSIE
        and bool(sauvegarde.emplacement)
        and Path(sauvegarde.emplacement).is_file()
    )


def commencer(sauvegarde: Sauvegarde, auteur: Auteur) -> dict[str, Any] | None:
    """Prend le verrou, inscrit la copie de sûreté ; None si une autre est en cours."""
    numero = _numero_suivant()
    if not cache.add(CLE_VERROU, numero, DUREE_DU_VERROU):
        return None
    copie = depot_sauvegardes.commencer(
        Genre.AVANT_RESTAURATION,
        Declencheur.AVANT_RESTAURATION,
        sauvegarde.pk,
    )
    etat = {
        "id": numero,
        "statut": EN_COURS,
        "sauvegarde": sauvegarde.pk,
        "copie_de_surete": copie,
        "controles": None,
        "erreur": "",
        "auteur": asdict(auteur),
        "debut": timezone.now().isoformat(),
        "fin": None,
    }
    _ecrire(etat)
    return etat


def liberer(numero: int) -> None:
    if cache.get(CLE_VERROU) == numero:
        cache.delete(CLE_VERROU)


def executer(numero: int) -> dict[str, Any] | None:
    """Essai, copie de sûreté, remplacement de la base, puis contrôle des totaux."""
    etat = lire(numero)
    if etat is None or etat["statut"] != EN_COURS:
        return etat
    try:
        _executer(etat)
    except Exception as erreur:
        logger.exception("Restauration %s impossible", numero)
        _echouer(etat, str(erreur) or erreur.__class__.__name__)
    finally:
        liberer(numero)
    return etat


def _executer(etat: dict[str, Any]) -> None:
    fichier = Path(depot_sauvegardes.fichier(etat["sauvegarde"]))
    copie = etat["copie_de_surete"]
    # 1. La copie choisie est lisible : ses totaux servent de référence.
    reference = essayer(fichier).totaux
    # 2. Copie de sûreté de la base actuelle, pour revenir en arrière.
    chemin = dossier_sauvegardes() / (
        f"avant-restauration-{timezone.now():%Y%m%d-%H%M%S}.dump"
    )
    try:
        taille = PgDump().exporter(chemin)
    except Exception as erreur:
        depot_sauvegardes.echouer(copie, str(erreur))
        raise
    depot_sauvegardes.reussir(copie, str(chemin), taille)
    # 3. Remplacement en une transaction : un échec laisse la base intacte.
    remplacer(fichier)
    # 4. La base restaurée ignore la copie de sûreté : on la réinscrit.
    etat["copie_de_surete"] = _reinscrire_copie(copie, etat["sauvegarde"], chemin)
    apres = totaux_de_la_base()
    etat["controles"] = {
        nom: {
            "avant": reference.get(nom, 0),
            "apres": apres.get(nom, 0),
            "ok": reference.get(nom, 0) == apres.get(nom, 0),
        }
        for nom in apres
    }
    etat["statut"] = TERMINEE
    etat["fin"] = timezone.now().isoformat()
    journaliser(
        "sauvegarde.restauree",
        auteur=_auteur_present(etat["auteur"]),
        objet_type="sauvegarde",
        objet_id=etat["sauvegarde"],
        apres={
            "fichier": fichier.name,
            "copie": chemin.name,
            "copie_de_surete": etat["copie_de_surete"],
            "controles": etat["controles"],
            "conforme": all(
                c["avant"] == c["apres"] for c in etat["controles"].values()
            ),
        },
    )
    _ecrire(etat)


def _echouer(etat: dict[str, Any], erreur: str) -> None:
    """La base n'a pas été remplacée (transaction unique) : elle reste celle d'avant."""
    Sauvegarde.objects.filter(
        pk=etat["copie_de_surete"],
        statut=Statut.EN_COURS,
    ).update(statut=Statut.ECHEC, erreur="Restauration abandonnée.", fin=timezone.now())
    etat["statut"] = ECHEC
    etat["erreur"] = erreur[-500:]
    etat["fin"] = timezone.now().isoformat()
    _ecrire(etat)
    journaliser(
        "sauvegarde.restauration_echec",
        auteur=_auteur_present(etat["auteur"]),
        objet_type="sauvegarde",
        objet_id=etat["sauvegarde"],
        apres={"erreur": etat["erreur"]},
    )


def _reinscrire_copie(copie: int, source: int, chemin: Path) -> int:
    """Garde l'identifiant annoncé au front s'il est libre dans la base restaurée."""
    champs = {
        "genre": Genre.AVANT_RESTAURATION,
        "declencheur": Declencheur.AVANT_RESTAURATION,
        "statut": Statut.REUSSIE,
        "source_id": source if Sauvegarde.objects.filter(pk=source).exists() else None,
        "emplacement": str(chemin),
        "taille": chemin.stat().st_size,
        "fin": timezone.now(),
    }
    if Sauvegarde.objects.filter(pk=copie).exists():
        return Sauvegarde.objects.create(**champs).pk
    Sauvegarde.objects.create(pk=copie, **champs)
    # Un identifiant posé à la main n'avance pas la séquence : on la recale.
    with connection.cursor() as curseur:
        for requete in connection.ops.sequence_reset_sql(no_style(), [Sauvegarde]):
            curseur.execute(requete)
    return copie


def _auteur_present(valeurs: dict[str, Any]) -> Auteur:
    """L'auteur peut manquer dans la base restaurée : son nom reste au journal."""
    auteur = Auteur(**{**valeurs, "entree": Entree(valeurs["entree"])})
    utilisateur = auteur.utilisateur_id
    if (
        utilisateur is not None
        and get_user_model().objects.filter(pk=utilisateur).exists()
    ):
        return auteur
    return replace(auteur, utilisateur_id=None)
