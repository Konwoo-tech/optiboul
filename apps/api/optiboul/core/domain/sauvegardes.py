"""Sauvegardes (CdC §5.12, US-142). Python pur : échéances, noms, conservation."""

from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from enum import StrEnum


class Genre(StrEnum):
    LOCALE = "locale"
    CLOUD = "cloud"
    # Copie de sûreté prise juste avant une restauration (#304).
    AVANT_RESTAURATION = "avant_restauration"


class Declencheur(StrEnum):
    PLANIFIEE = "planifiee"  # toutes les N heures (paramètre sauvegarde_locale)
    CLOTURE_CAISSE = "cloture_caisse"
    CLOTURE_PRODUCTION = "cloture_production"
    CLOTURE_SEMAINE = "cloture_semaine"
    MANUELLE = "manuelle"


class Statut(StrEnum):
    EN_COURS = "en_cours"
    REUSSIE = "reussie"
    ECHEC = "echec"


def sauvegarde_due(
    derniere: datetime | None,
    maintenant: datetime,
    intervalle_heures: int,
) -> bool:
    """Due si la dernière sauvegarde réussie date d'au moins N heures."""
    return derniere is None or maintenant - derniere >= timedelta(
        hours=intervalle_heures,
    )


def copie_cloud_en_retard(
    derniere: datetime | None,
    maintenant: datetime,
    seuil_heures: int,
) -> bool:
    """Alerte au-delà de 48 h (paramètre) sans copie cloud réussie."""
    return derniere is None or maintenant - derniere > timedelta(hours=seuil_heures)


def nom_fichier(horodatage: datetime, declencheur: Declencheur) -> str:
    return f"optiboul-{horodatage:%Y%m%d-%H%M%S}-{declencheur}.dump"


def a_supprimer(
    fichiers: dict[str, datetime],
    maintenant: datetime,
    conservation_jours: int,
    garder_au_moins: int = 6,
) -> list[str]:
    """Copies locales trop anciennes ; les plus récentes sont toujours gardées."""
    par_date = sorted(fichiers, key=fichiers.__getitem__, reverse=True)
    limite = maintenant - timedelta(days=conservation_jours)
    return [nom for nom in par_date[garder_au_moins:] if fichiers[nom] < limite]
