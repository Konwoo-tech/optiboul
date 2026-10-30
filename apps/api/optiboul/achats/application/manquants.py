"""Manquants à livrer (US-102, CdC §5.7, R11, O12) : relancer ou replanifier."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.achats.application.receptions import RECEPTIONNENT
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier

if TYPE_CHECKING:
    from datetime import date
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal


class StatutManquant(StrEnum):
    A_LIVRER = "a_livrer"
    REPLANIFIE = "replanifie"
    LIVRE = "livre"


@dataclass(frozen=True)
class EtatManquant:
    id: int
    fournisseur: str
    telephone: str
    matiere: str
    quantite: Decimal
    statut: StatutManquant


class DepotManquants(Protocol):
    def verrouiller(self, manquant_id: int) -> EtatManquant | None: ...

    def noter_relance(self, manquant_id: int) -> None: ...

    def replanifier(
        self,
        manquant_id: int,
        *,
        prevue_le: date,
        auteur: int,
    ) -> int: ...


class Envois(Protocol):
    def relancer(self, manquant: EtatManquant) -> int: ...


@dataclass(frozen=True)
class Depots:
    manquants: DepotManquants
    envois: Envois
    journal: Journal


def _a_livrer(depots: Depots, manquant_id: int, auteur: Auteur) -> EtatManquant:
    if auteur.profil not in RECEPTIONNENT or auteur.utilisateur_id is None:
        message = (
            "Seuls le gérant et le responsable de production suivent les manquants."
        )
        raise RefusMetier("droit_insuffisant", message)
    manquant = depots.manquants.verrouiller(manquant_id)
    if manquant is None:
        raise RefusMetier("manquant_inconnu", "Ce manquant n'existe pas.")
    if manquant.statut is not StatutManquant.A_LIVRER:
        raise RefusMetier("manquant_clos", "Ce manquant est déjà suivi.")
    return manquant


def relancer(depots: Depots, *, manquant_id: int, auteur: Auteur) -> None:
    """WhatsApp au fournisseur, par la file d'envoi (O15)."""
    manquant = _a_livrer(depots, manquant_id, auteur)
    if not manquant.telephone:
        message = "Ce fournisseur n'a pas de numéro de téléphone."
        raise RefusMetier("telephone_absent", message)
    message_id = depots.envois.relancer(manquant)
    depots.manquants.noter_relance(manquant_id)
    depots.journal.enregistrer(
        Evenement(
            action="manquant.relance",
            auteur=auteur,
            objet_type="manquant",
            objet_id=str(manquant_id),
            apres={"message": message_id},
        ),
    )


def replanifier(
    depots: Depots,
    *,
    manquant_id: int,
    prevue_le: date,
    auteur: Auteur,
    aujourdhui: date,
) -> int:
    """Une nouvelle réception planifiée, de la quantité manquante."""
    _a_livrer(depots, manquant_id, auteur)
    if prevue_le < aujourdhui:
        raise RefusMetier("date_passee", "La date prévue est passée.")
    assert auteur.utilisateur_id is not None
    planifiee = depots.manquants.replanifier(
        manquant_id,
        prevue_le=prevue_le,
        auteur=auteur.utilisateur_id,
    )
    depots.journal.enregistrer(
        Evenement(
            action="manquant.replanifie",
            auteur=auteur,
            objet_type="manquant",
            objet_id=str(manquant_id),
            apres={"planifiee": planifiee, "prevue_le": prevue_le.isoformat()},
        ),
    )
    return planifiee
