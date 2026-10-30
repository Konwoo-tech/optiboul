"""Paie (US-120, CdC §5.10, R12). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import timedelta
from decimal import ROUND_HALF_UP
from decimal import Decimal
from enum import StrEnum

JOURS_DU_MOIS = 26


class GenreElement(StrEnum):
    GAIN = "gain"
    PENALITE = "penalite"


class StatutPaie(StrEnum):
    BROUILLON = "brouillon"
    SOUMIS = "soumis"
    VALIDE = "valide"
    EN_PAIEMENT = "en_paiement"
    PAYEE = "payee"


def montant_absences(base: int, jours: Decimal) -> int:
    """Une absence vaut base ÷ 26, arrondi au franc."""
    montant = base * jours / JOURS_DU_MOIS
    return int(montant.quantize(Decimal(1), ROUND_HALF_UP))


@dataclass(frozen=True)
class Calcul:
    base: int
    absences: int
    avances: int
    penalites: int
    gains: int
    impaye: int

    @property
    def net(self) -> int:
        return (
            self.base
            - self.absences
            - self.avances
            - self.penalites
            + self.gains
            + self.impaye
        )


def mois_precedent(mois: date) -> date:
    return (mois.replace(day=1) - timedelta(days=1)).replace(day=1)
