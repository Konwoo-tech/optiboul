"""Encaissements (CdC §5.3, R7, R21). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from optiboul.core.domain.erreurs import RefusMetier


class ModePaiement(StrEnum):
    ESPECES = "especes"
    MTN = "mtn"  # MTN Mobile Money
    ORANGE = "orange"  # Orange Money

    @property
    def mobile_money(self) -> bool:
        return self is not ModePaiement.ESPECES


@dataclass(frozen=True)
class Paiement:
    mode: ModePaiement
    montant: int
    reference: str = ""


def verifier_paiement(paiement: Paiement) -> Paiement:
    """Montant positif ; référence de transaction obligatoire en mobile money (R7)."""
    if paiement.montant <= 0:
        message = "Le montant encaissé doit être positif."
        raise RefusMetier("montant_invalide", message)
    reference = paiement.reference.strip()
    if paiement.mode.mobile_money and not reference:
        message = "La référence de la transaction est obligatoire en mobile money (R7)."
        raise RefusMetier("reference_obligatoire", message)
    return Paiement(paiement.mode, paiement.montant, reference)
