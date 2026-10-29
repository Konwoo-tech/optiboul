"""Planning des caisses (CdC §5.1, R17) : 7 jours, jour et nuit. Python pur."""

from __future__ import annotations

from datetime import date
from datetime import timedelta
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .semaines import Bornes


class Creneau(StrEnum):
    JOUR = "jour"  # de 06:00 à 18:00
    NUIT = "nuit"  # de 18:00 à 06:00 le lendemain


Affectations = dict[tuple[date, Creneau], int | None]


def creneaux(periode: Bornes) -> list[tuple[date, Creneau]]:
    return [(jour, creneau) for jour in periode.jours for creneau in Creneau]


def vides(periode: Bornes, affectations: Affectations) -> list[tuple[date, Creneau]]:
    """Créneaux sans caissière : alerte (US-031) et ouverture de semaine bloquée."""
    return [cle for cle in creneaux(periode) if affectations.get(cle) is None]


def conflits(affectations: Affectations) -> list[dict[str, object]]:
    """Même caissière de nuit puis de jour au matin, ou jour et nuit le même jour."""
    trouves: list[dict[str, object]] = []
    for (jour, creneau), caissiere in sorted(affectations.items()):
        if caissiere is None or creneau is not Creneau.NUIT:
            continue
        if affectations.get((jour, Creneau.JOUR)) == caissiere:
            trouves.append(
                {"genre": "jour_et_nuit", "jour": jour, "caissiere": caissiere},
            )
        if affectations.get((jour + timedelta(days=1), Creneau.JOUR)) == caissiere:
            trouves.append(
                {"genre": "nuit_puis_jour", "jour": jour, "caissiere": caissiere},
            )
    return trouves


def decaler(affectations: Affectations, jours: int) -> Affectations:
    """Pour copier le planning d'une semaine sur la suivante (O9)."""
    ecart = timedelta(days=jours)
    return {(jour + ecart, creneau): c for (jour, creneau), c in affectations.items()}
