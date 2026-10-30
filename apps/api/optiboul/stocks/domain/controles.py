"""Contrôles physiques du stock (US-093, CdC §5.6, R9, R16, O13). Python pur."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import StrEnum

CENT = Decimal(100)
DIMANCHE = "dimanche"
JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", DIMANCHE)


class StatutControle(StrEnum):
    PREVU = "prevu"
    A_FAIRE = "a_faire"  # le jour même
    FAIT = "fait"
    MANQUE = "manque"


class PorteeControle(StrEnum):
    CLES = "cles"  # farine, levure, améliorant
    TOUTES = "toutes"


class StatutLigne(StrEnum):
    AJUSTEE = "ajustee"
    SOUMISE = "soumise"  # écart au-delà de la tolérance : accord du propriétaire
    REFUSEE = "refusee"


def portee_du_jour(jour: str) -> PorteeControle:
    """Le dimanche porte sur toutes les matières, les autres jours sur les clés."""
    return PorteeControle.TOUTES if jour == DIMANCHE else PorteeControle.CLES


def date_du_jour(annee: int, numero: int, jour: str) -> date:
    return date.fromisocalendar(annee, numero, JOURS.index(jour) + 1)


def ecart_pourcent(theorique: Decimal, compte: Decimal) -> Decimal:
    if theorique == 0:
        return Decimal(0) if compte == 0 else CENT
    return abs(compte - theorique) * CENT / abs(theorique)


def a_soumettre(theorique: Decimal, compte: Decimal, tolerance: int) -> bool:
    """R9 : au-delà de la tolérance, l'ajustement attend le propriétaire."""
    return ecart_pourcent(theorique, compte) > tolerance
