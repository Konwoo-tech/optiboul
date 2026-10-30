"""Indicateurs du mois (CdC §5.11). Python pur."""

from __future__ import annotations

from datetime import date


def taux_encaissement(recu: int, du: int) -> int | None:
    """Part des ventes du mois réellement encaissée, en pourcentage entier."""
    return round(recu * 100 / du) if du else None


def bornes_du_mois(mois: date) -> tuple[date, date]:
    """Premier jour du mois et premier jour du mois suivant."""
    debut = mois.replace(day=1)
    suivant = date(debut.year + debut.month // 12, debut.month % 12 + 1, 1)
    return debut, suivant
