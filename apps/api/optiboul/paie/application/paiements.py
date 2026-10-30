"""Payer les salaires (US-124, CdC §5.10, R12)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.paie.domain.paie import PAYABLES
from optiboul.paie.domain.paie import StatutPaie

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal

PAIENT = frozenset({"gerant"})
MODES = ("especes", "banque", "mobile")


@dataclass(frozen=True)
class EtatLigne:
    id: int
    etat: int
    statut: StatutPaie
    mois: date
    employe: str
    net: int
    paye: int

    @property
    def reste(self) -> int:
        return self.net - self.paye


class DepotPaiements(Protocol):
    def verrouiller_ligne(self, ligne_id: int) -> EtatLigne | None: ...

    def lignes_restantes(self, etat_id: int) -> list[int]: ...

    def enregistrer(  # noqa: PLR0913
        self,
        ligne_id: int,
        *,
        montant: int,
        mode: str,
        reference: str,
        depense: int,
        auteur: int,
        le: datetime,
    ) -> int: ...

    def marquer(self, etat_id: int, statut: StatutPaie) -> None: ...


class Depenses(Protocol):
    def salaire_paye(
        self,
        ligne: EtatLigne,
        *,
        montant: int,
        mode: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> int:
        """La dépense « Salaires » de la semaine ; renvoie son identifiant."""
        ...


@dataclass(frozen=True)
class Depots:
    paiements: DepotPaiements
    depenses: Depenses
    journal: Journal


def _verifier(auteur: Auteur, mode: str, reference: str) -> int:
    if auteur.profil not in PAIENT or auteur.utilisateur_id is None:
        raise RefusMetier("droit_insuffisant", "Le gérant paie les salaires.")
    if mode not in MODES:
        raise RefusMetier("mode_inconnu", "Mode de paiement inconnu.")
    if mode == "mobile" and not reference.strip():
        message = "La référence de la transaction est obligatoire en mobile money."
        raise RefusMetier("reference_obligatoire", message)
    return auteur.utilisateur_id


def _payer(  # noqa: PLR0913
    depots: Depots,
    ligne: EtatLigne,
    *,
    montant: int,
    mode: str,
    reference: str,
    auteur: Auteur,
    utilisateur: int,
    maintenant: datetime,
) -> int:
    depense = depots.depenses.salaire_paye(
        ligne,
        montant=montant,
        mode=mode,
        auteur=auteur,
        maintenant=maintenant,
    )
    paiement = depots.paiements.enregistrer(
        ligne.id,
        montant=montant,
        mode=mode,
        reference=reference.strip(),
        depense=depense,
        auteur=utilisateur,
        le=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="paie.salaire_paye",
            auteur=auteur,
            objet_type="ligne_paie",
            objet_id=str(ligne.id),
            apres={"paiement": paiement, "montant": montant, "mode": mode},
        ),
    )
    return paiement


def _apres_paiement(depots: Depots, etat_id: int) -> None:
    reste = depots.paiements.lignes_restantes(etat_id)
    depots.paiements.marquer(
        etat_id,
        StatutPaie.EN_PAIEMENT if reste else StatutPaie.PAYEE,
    )


def payer(  # noqa: PLR0913
    depots: Depots,
    *,
    ligne_id: int,
    montant: int,
    mode: str,
    reference: str,
    auteur: Auteur,
    maintenant: datetime,
) -> int:
    """Un salaire, en une ou plusieurs fois, une fois l'état validé."""
    utilisateur = _verifier(auteur, mode, reference)
    ligne = depots.paiements.verrouiller_ligne(ligne_id)
    if ligne is None:
        raise RefusMetier("ligne_paie_inconnue", "Cette ligne de paie n'existe pas.")
    if ligne.statut not in PAYABLES:
        raise RefusMetier("paie_non_validee", "L'état de paie n'est pas validé.")
    if montant <= 0 or montant > ligne.reste:
        message = f"Le montant va de 1 à {ligne.reste} FCFA."
        raise RefusMetier("montant_invalide", message, reste=ligne.reste)
    paiement = _payer(
        depots,
        ligne,
        montant=montant,
        mode=mode,
        reference=reference,
        auteur=auteur,
        utilisateur=utilisateur,
        maintenant=maintenant,
    )
    _apres_paiement(depots, ligne.etat)
    return paiement


def payer_tout(  # noqa: PLR0913
    depots: Depots,
    *,
    etat_id: int,
    mode: str,
    reference: str,
    auteur: Auteur,
    maintenant: datetime,
) -> int:
    """Tous les restes de l'état ; renvoie le nombre de salaires payés."""
    utilisateur = _verifier(auteur, mode, reference)
    identifiants = depots.paiements.lignes_restantes(etat_id)
    lignes = [depots.paiements.verrouiller_ligne(i) for i in identifiants]
    a_payer = [ligne for ligne in lignes if ligne is not None]
    if any(ligne.statut not in PAYABLES for ligne in a_payer):
        raise RefusMetier("paie_non_validee", "L'état de paie n'est pas validé.")
    for ligne in a_payer:
        _payer(
            depots,
            ligne,
            montant=ligne.reste,
            mode=mode,
            reference=reference,
            auteur=auteur,
            utilisateur=utilisateur,
            maintenant=maintenant,
        )
    if a_payer:
        _apres_paiement(depots, etat_id)
    return len(a_payer)
