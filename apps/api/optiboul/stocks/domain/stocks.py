"""Registre du stock (CdC §5.6, ADR-04) : le stock est la somme des mouvements.

Python pur.
"""

from __future__ import annotations

from decimal import Decimal
from enum import IntEnum
from enum import StrEnum


class Sens(IntEnum):
    SORTIE = -1
    ENTREE = 1


class GenreMouvementStock(StrEnum):
    PRODUCTION = "production"  # sortie à la clôture de production (R5)
    RECEPTION = "reception"  # entrée d'une réception fournisseur
    ACHAT = "achat"  # achat payé en caisse, rattaché au stock
    PERTE = "perte"  # perte ou casse, motivée
    CORRECTION = "correction"  # correction manuelle motivée
    INVENTAIRE = "inventaire"  # ajustement d'inventaire


def stock(mouvements: list[tuple[Sens, Decimal]]) -> Decimal:
    return sum((sens * quantite for sens, quantite in mouvements), Decimal(0))


def sorties_de_production(
    consommation: dict[str, Decimal],
    suivies: set[str],
) -> dict[str, Decimal]:
    """La consommation réelle des matières suivies en stock (l'eau ne l'est pas)."""
    return {
        matiere: quantite
        for matiere, quantite in consommation.items()
        if matiere in suivies and quantite > 0
    }
