"""Regroupement des notifications par type et par heure (US-073, CdC §5.13).

Python pur.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import datetime


@dataclass(frozen=True)
class Avis:
    genre: str
    titre: str
    lien: str
    le: datetime  # heure locale
    lu: bool


@dataclass(frozen=True)
class Groupe:
    genre: str
    heure: datetime
    titre: str  # celui de la plus récente
    lien: str
    nombre: int
    non_lues: int


def heure_de(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)


def regrouper(avis: list[Avis]) -> list[Groupe]:
    """Attend les avis du plus récent au plus ancien, et garde cet ordre."""
    groupes: dict[tuple[str, datetime], list[Avis]] = {}
    for un_avis in avis:
        groupes.setdefault((un_avis.genre, heure_de(un_avis.le)), []).append(un_avis)
    return [
        Groupe(
            genre=genre,
            heure=heure,
            titre=membres[0].titre,
            lien=membres[0].lien,
            nombre=len(membres),
            non_lues=sum(not membre.lu for membre in membres),
        )
        for (genre, heure), membres in groupes.items()
    ]
