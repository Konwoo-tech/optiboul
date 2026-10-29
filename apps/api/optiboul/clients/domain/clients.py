"""Clients et tarifs (CdC §5.4, R6, R21). Python pur."""

from __future__ import annotations

from enum import IntEnum
from enum import StrEnum

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.users.domain.comptes import CompteInvalide
from optiboul.users.domain.comptes import normaliser_telephone


class TypeClient(StrEnum):
    LIVREUR = "livreur"  # client livreur, qui revend
    RESTAURANT = "restaurant"
    HOTEL = "hotel"
    PARTICULIER = "particulier"


def telephone_du_client(telephone: str) -> str:
    """Le numéro des relances WhatsApp : vide, ou 9 chiffres commençant par 6."""
    if not telephone.strip():
        return ""
    try:
        return normaliser_telephone(telephone)
    except CompteInvalide as erreur:
        raise RefusMetier("telephone_invalide", str(erreur)) from None


def plafond_du_client(plafond_propre: int | None, plafond_general: int) -> int:
    """Le plafond propre du client, sinon le plafond général (R6, 2 000 FCFA)."""
    return plafond_general if plafond_propre is None else plafond_propre


def prix_du_client(tarif: int | None, prix_de_base: int | None) -> int | None:
    """Le tarif du client, sinon le prix de base du produit ; None : pas de prix."""
    return tarif if tarif is not None else prix_de_base


class Sens(IntEnum):
    """Sens d'un mouvement de compte : le solde négatif est une dette (R21)."""

    DEBIT = -1  # livraison
    CREDIT = 1  # encaissement


def solde(mouvements: list[tuple[Sens, int]]) -> int:
    """Le solde n'est jamais saisi : il est la somme des mouvements (R21)."""
    return sum(sens * montant for sens, montant in mouvements)


class StatutDette(StrEnum):
    A_JOUR = "a_jour"
    DETTE = "dette"
    PLAFOND_DEPASSE = "plafond_depasse"


def statut_dette(solde: int, plafond: int) -> StatutDette:
    """À jour, dette dans le plafond, ou plafond dépassé (CdC §5.4)."""
    if solde >= 0:
        return StatutDette.A_JOUR
    return StatutDette.PLAFOND_DEPASSE if -solde > plafond else StatutDette.DETTE


def jauge(solde: int, plafond: int) -> int:
    """Part du plafond utilisée, en pourcentage entier ; au-delà de 100 : dépassé."""
    dette = max(0, -solde)
    if plafond <= 0:
        return 100 if dette else 0
    return round(dette * 100 / plafond)


def texte_relance(nom: str, echeance: str, montant: str) -> str:
    """Message WhatsApp d'une relance de dette, à régler avant l'échéance (R6)."""
    return (
        f"Bonjour {nom}, la Boulangerie du Faubourg vous rappelle votre solde de "
        f"{montant}, à régler au plus tard {echeance}. Merci !"
    )
