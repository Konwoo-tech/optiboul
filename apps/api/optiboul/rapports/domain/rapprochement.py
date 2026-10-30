"""Rapprochement avec l'Excel pendant la semaine en parallèle (US-151). Python pur."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Totaux:
    ventes: int
    recette: int


@dataclass(frozen=True)
class Ecart:
    jour: str
    creneau: str
    application: Totaux | None  # None : session absente de ce côté
    excel: Totaux | None


def comparer(
    application: dict[tuple[str, str], Totaux],
    excel: dict[tuple[str, str], Totaux],
) -> list[Ecart]:
    """Toute différence compte : la bascule exige des totaux identiques."""
    return [
        Ecart(jour, creneau, application.get(cle), excel.get(cle))
        for cle in sorted(set(application) | set(excel))
        for jour, creneau in [cle]
        if application.get(cle) != excel.get(cle)
    ]
