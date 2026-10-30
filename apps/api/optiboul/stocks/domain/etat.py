"""État du stock par matière (US-090, CdC §5.6). Python pur."""

from __future__ import annotations

from decimal import ROUND_DOWN
from decimal import ROUND_HALF_UP
from decimal import Decimal
from enum import StrEnum

DIXIEME = Decimal("0.1")


class StatutStock(StrEnum):
    SUFFISANT = "suffisant"
    A_COMMANDER = "a_commander"
    STOCK_BAS = "stock_bas"


def sessions_restantes(quantite: Decimal, besoin: Decimal) -> Decimal | None:
    """Sans consommation connue, rien ne permet de l'estimer."""
    if besoin <= 0:
        return None
    return (max(quantite, Decimal(0)) / besoin).quantize(DIXIEME, ROUND_DOWN)


def statut_stock(
    quantite: Decimal,
    sessions: Decimal | None,
    *,
    bas: int,
    a_commander: int,
) -> StatutStock:
    if quantite <= 0 or (sessions is not None and sessions < bas):
        return StatutStock.STOCK_BAS
    if sessions is not None and sessions < a_commander:
        return StatutStock.A_COMMANDER
    return StatutStock.SUFFISANT


def valeur_stock(quantite: Decimal, prix: Decimal) -> int:
    """Montant entier en FCFA."""
    return int((max(quantite, Decimal(0)) * prix).quantize(Decimal(1), ROUND_HALF_UP))
