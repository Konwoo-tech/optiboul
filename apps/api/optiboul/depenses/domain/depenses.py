"""Dépenses (CdC §5.8, R8, O7). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from optiboul.core.domain.erreurs import RefusMetier

if TYPE_CHECKING:
    from decimal import Decimal


class Categorie(StrEnum):
    MATIERES = "matieres"
    SALAIRES = "salaires"
    ELECTRICITE = "electricite"
    EAU = "eau"
    ADMINISTRATION = "administration"
    TECHNIQUE = "technique"
    PETIT_MATERIEL = "petit_materiel"
    LAIT = "lait"  # lait, supplément de salaire
    EXTRA = "extra"


class PayePar(StrEnum):
    CAISSE = "caisse"
    BANQUE = "banque"
    MOBILE = "mobile"  # mobile money


class Rattachement(StrEnum):
    PRODUCTION = "production"  # la production en cours
    SEMAINE = "semaine"  # frais généraux
    STOCK = "stock"  # une matière entre en stock


class StatutDepense(StrEnum):
    VALIDEE = "validee"
    EN_ATTENTE = "en_attente"  # au-dessus du seuil, hors pré-autorisation (R8)
    REFUSEE = "refusee"


@dataclass(frozen=True)
class NouvelleDepense:
    categorie: Categorie
    libelle: str
    montant: int
    paye_par: PayePar
    rattachement: Rattachement
    matiere: str = ""
    quantite: Decimal | None = None
    fournisseur: str = ""  # fournisseur ou marché, pour un achat en stock
    achat_courant: str = ""  # bois, levure… : la pré-autorisation de la semaine (O7)


def verifier_depense(depense: NouvelleDepense, matieres_suivies: set[str]) -> None:
    """Montant positif, libellé ; un achat en stock dit quoi, combien et chez qui."""
    if depense.montant <= 0:
        message = "Le montant de la dépense est positif."
        raise RefusMetier("montant_invalide", message)
    if not depense.libelle.strip():
        message = "Le libellé de la dépense est obligatoire."
        raise RefusMetier("libelle_obligatoire", message)
    if depense.rattachement is Rattachement.STOCK:
        if depense.matiere not in matieres_suivies:
            message = "Indiquez une matière suivie en stock."
            raise RefusMetier("matiere_inconnue", message)
        if depense.quantite is None or depense.quantite <= 0:
            message = "Indiquez la quantité qui entre en stock."
            raise RefusMetier("quantite_invalide", message)
        if not depense.fournisseur.strip():
            message = "Indiquez le fournisseur ou le marché."
            raise RefusMetier("fournisseur_obligatoire", message)


def numero_affiche(numero: int) -> str:
    """« DEP-0042 »."""
    return f"DEP-{numero:04d}"


class AchatCourant(StrEnum):
    """Catégories des achats courants pré-autorisables (O7)."""

    BOIS = "bois"
    LEVURE = "levure"
    GLACE = "glace"
    SEL = "sel"
    HUILE = "huile"


def dans_la_pre_autorisation(plafond: int, deja_engage: int, montant: int) -> bool:
    """La dépense tient dans ce qui reste du plafond de la semaine (O7)."""
    return montant <= plafond - deja_engage
