"""Matières premières (CdC §5.5, §5.6). Python pur."""

from __future__ import annotations

from enum import StrEnum


class Unite(StrEnum):
    """Unité de la recette et du stock (matières de départ : migration 0001)."""

    KG = "kg"
    G = "g"  # intrants en grammes : écart toléré en pourcentage (R10)
    LITRE = "l"
    SACHET = "sachet"
    UNITE = "unite"
