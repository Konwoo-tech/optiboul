"""Réceptions fournisseurs (CdC §5.7, R11, O12). Python pur."""

from __future__ import annotations

from decimal import ROUND_HALF_UP
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from optiboul.core.domain.erreurs import RefusMetier

if TYPE_CHECKING:
    from datetime import date


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


POIDS_SAC_FARINE_KG = 50


def montant_farine(kilos: Decimal, prix_du_sac: int) -> int:
    """La farine se facture au sac de 50 kg (paramètre prix_sac_farine), en FCFA."""
    return int(
        (kilos * prix_du_sac / POIDS_SAC_FARINE_KG).quantize(Decimal(1), ROUND_HALF_UP),
    )


def montant(quantite: Decimal, prix_unitaire: int) -> int:
    return int((quantite * prix_unitaire).quantize(Decimal(1), ROUND_HALF_UP))


def ecart(prevue: Decimal, recue: Decimal) -> Decimal:
    """Reçu moins prévu : négatif, un manquant reste à livrer (R11)."""
    return recue - prevue


class StatutFacture(StrEnum):
    A_PAYER = "a_payer"
    EN_COURS = "en_cours"  # payée en partie
    PAYEE = "payee"


def statut_apres_paiement(montant: int, deja_paye: int, paiement: int) -> StatutFacture:
    """Un paiement positif, sans dépasser le reste dû ; la facture suit."""
    reste = montant - deja_paye
    if paiement <= 0 or paiement > reste:
        message = f"Le paiement doit être entre 1 et {reste} FCFA (reste dû)."
        raise RefusMetier("paiement_invalide", message, reste=reste)
    return StatutFacture.PAYEE if paiement == reste else StatutFacture.EN_COURS
