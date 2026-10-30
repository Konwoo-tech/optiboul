"""Réceptions fournisseurs (CdC §5.7, R11, O12). Python pur."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from optiboul.core.domain.erreurs import RefusMetier

if TYPE_CHECKING:
    from datetime import date
    from decimal import Decimal


class StatutReception(StrEnum):
    PLANIFIEE = "planifiee"
    RECUE = "recue"
    ANNULEE = "annulee"


def verifier_planification(
    *,
    matiere: str,
    matieres_du_fournisseur: set[str],
    quantite: Decimal,
    prevue_le: date,
    aujourd_hui: date,
) -> None:
    """Une matière que le fournisseur livre, une quantité positive, une date à venir."""
    if matiere not in matieres_du_fournisseur:
        message = "Ce fournisseur ne livre pas cette matière."
        raise RefusMetier("matiere_hors_fournisseur", message)
    if quantite <= 0:
        message = "La quantité prévue est positive."
        raise RefusMetier("quantite_invalide", message)
    if prevue_le < aujourd_hui:
        message = "La date prévue est passée."
        raise RefusMetier("date_passee", message)
