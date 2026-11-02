"""Clients et tarifs (CdC §5.4, R6, R21). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from enum import StrEnum
from typing import TYPE_CHECKING

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.parametres import JOURS
from optiboul.users.domain.comptes import CompteInvalide
from optiboul.users.domain.comptes import normaliser_telephone

if TYPE_CHECKING:
    from collections.abc import Callable
    from datetime import date
    from datetime import datetime


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


LIBELLES_RELEVE = {
    "livraison": "Livraison",
    "encaissement": "Encaissement",
    "reprise": "Reprise de solde",
}


@dataclass(frozen=True)
class LigneReleve:
    jour: date
    libelle: str
    debit: int
    credit: int
    solde: int


@dataclass(frozen=True)
class Releve:
    solde_initial: int
    lignes: list[LigneReleve]
    solde_final: int


def construire_releve(
    solde_initial: int,
    mouvements: list[tuple[date, str, int, int]],
) -> Releve:
    """Historique de la période, avec le solde après chaque opération (R21)."""
    solde = solde_initial
    lignes = []
    for jour, origine, sens, montant in mouvements:
        solde += sens * montant
        lignes.append(
            LigneReleve(
                jour=jour,
                libelle=LIBELLES_RELEVE.get(origine, origine.capitalize()),
                debit=montant if sens < 0 else 0,
                credit=montant if sens > 0 else 0,
                solde=solde,
            ),
        )
    return Releve(solde_initial, lignes, solde)


def texte_releve(
    nom: str,
    du: date,
    au: date,
    releve: Releve,
    fcfa: Callable[[int], str],
) -> str:
    lignes = [
        f"{ligne.jour:%d/%m} {ligne.libelle} : {fcfa(ligne.credit or -ligne.debit)}"
        for ligne in releve.lignes
    ]
    entete = (
        f"Bonjour {nom}, votre relevé de la Boulangerie du Faubourg "
        f"du {du:%d/%m} au {au:%d/%m} :"
    )
    return "\n".join(
        [
            entete,
            *lignes,
            f"Solde : {fcfa(releve.solde_final)}",
        ],
    )


def relance_due(maintenant: datetime, jours: list[str], heure: str) -> bool:
    """O11 : le bon jour, à partir de l'heure : un retard de tâche ne perd rien."""
    return (
        JOURS[maintenant.weekday()] in jours and maintenant.strftime("%H:%M") >= heure
    )


def texte_relance(nom: str, echeance: str, montant: str) -> str:
    """Message WhatsApp d'une relance de dette, à régler avant l'échéance (R6)."""
    return (
        f"Bonjour {nom}, la Boulangerie du Faubourg vous rappelle votre solde de "
        f"{montant}, à régler au plus tard {echeance}. Merci !"
    )
