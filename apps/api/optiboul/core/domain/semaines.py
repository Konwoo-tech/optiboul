"""Semaines de travail (CdC §5.1, R1 à R3). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import datetime
from datetime import time
from datetime import timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo("Africa/Douala")
DEBUT_DE_JOURNEE = time(6, 0)


class Statut(StrEnum):
    PLANIFIEE = "planifiee"
    OUVERTE = "ouverte"
    CLOTUREE = "cloturee"


@dataclass(frozen=True)
class Bornes:
    debut: datetime  # lundi 06:00
    fin: datetime  # lundi suivant 06:00

    @property
    def du(self) -> date:
        return self.debut.date()

    @property
    def au(self) -> date:
        return self.du + timedelta(days=6)

    @property
    def jours(self) -> list[date]:
        return [self.du + timedelta(days=i) for i in range(7)]


def bornes(annee: int, numero: int) -> Bornes:
    """Semaine ISO, du lundi 06:00 au lundi suivant 06:00 (heure de Yaoundé)."""
    lundi = date.fromisocalendar(annee, numero, 1)
    debut = datetime.combine(lundi, DEBUT_DE_JOURNEE, tzinfo=FUSEAU)
    return Bornes(debut=debut, fin=debut + timedelta(days=7))


def semaine_de(instant: datetime) -> tuple[int, int]:
    """Semaine à laquelle se rattache un instant : avant lundi 06:00, la précédente."""
    local = instant.astimezone(FUSEAU) - timedelta(hours=6)
    iso = local.isocalendar()
    return iso.year, iso.week


def precedente(annee: int, numero: int) -> tuple[int, int]:
    return semaine_de(bornes(annee, numero).debut - timedelta(hours=1))


def suivante(annee: int, numero: int) -> tuple[int, int]:
    return semaine_de(bornes(annee, numero).fin + timedelta(hours=1))


def code(numero: int) -> str:
    """« S42 », l'identifiant partagé avec l'application web."""
    return f"S{numero:02d}"


def proposer_rotation(candidats: list[int], precedent: int | None) -> int | None:
    """Rotation (O9) : la personne qui suit celle de la semaine précédente."""
    if not candidats:
        return None
    if precedent not in candidats:
        return candidats[0]
    return candidats[(candidats.index(precedent) + 1) % len(candidats)]


def conflits_affectation(
    *,
    gerant: int | None,
    production: int | None,
    gerant_precedent: int | None,
    production_precedente: int | None,
    inactifs: set[int],
) -> list[str]:
    """Conflits signalés sans bloquer : le propriétaire corrige ou assume."""
    conflits = []
    if gerant is not None and gerant == production:
        conflits.append("meme_personne")
    if gerant is not None and gerant == gerant_precedent:
        conflits.append("gerant_deux_semaines_de_suite")
    if production is not None and production == production_precedente:
        conflits.append("production_deux_semaines_de_suite")
    if {gerant, production} & inactifs:
        conflits.append("compte_inactif")
    return conflits


RAISONS_OUVERTURE = {
    "deja_ouverte": "La semaine est déjà ouverte.",
    "cloturee": "La semaine est clôturée.",
    "gerant_manquant": "Aucun gérant n'est affecté.",
    "production_manquante": "Aucun responsable de production n'est affecté.",
    "precedente_non_cloturee": "La semaine précédente n'est pas clôturée.",
    "autre_semaine_ouverte": "Une autre semaine est encore ouverte.",
}


def raisons_de_ne_pas_ouvrir(
    *,
    statut: Statut,
    gerant: int | None,
    production: int | None,
    precedente: Statut | None,
    autre_ouverte: bool,
) -> list[str]:
    """Ouverture (R2, CdC §5.1) : précédente clôturée et affectations faites."""
    if statut is Statut.OUVERTE:
        return ["deja_ouverte"]
    if statut is Statut.CLOTUREE:
        return ["cloturee"]
    raisons = []
    if gerant is None:
        raisons.append("gerant_manquant")
    if production is None:
        raisons.append("production_manquante")
    if precedente is not None and precedente is not Statut.CLOTUREE:
        raisons.append("precedente_non_cloturee")
    if autre_ouverte:
        raisons.append("autre_semaine_ouverte")
    return raisons
