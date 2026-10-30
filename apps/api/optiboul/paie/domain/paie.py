"""Paie (US-120, CdC §5.10, R12). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import datetime
from datetime import timedelta
from decimal import ROUND_HALF_UP
from decimal import Decimal
from enum import StrEnum

JOURS_DU_MOIS = 26
DELAI_AVANT_PAIE = 2


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


def echeance_validation(emise_le: datetime, jour_de_paie: int) -> datetime:
    """Deux jours avant le jour de paie (CdC §5.9), ce mois-ci ou le suivant."""
    limite = emise_le.replace(day=jour_de_paie) - timedelta(days=DELAI_AVANT_PAIE)
    if limite > emise_le:
        return limite
    suivant = (emise_le.replace(day=1) + timedelta(days=31)).replace(day=jour_de_paie)
    return suivant - timedelta(days=DELAI_AVANT_PAIE)


def mois_precedent(mois: date) -> date:
    return (mois.replace(day=1) - timedelta(days=1)).replace(day=1)
