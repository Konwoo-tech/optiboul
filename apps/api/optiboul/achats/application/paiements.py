"""Payer une facture fournisseur (US-103, CdC §5.7)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.achats.domain.receptions import statut_apres_paiement
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier

if TYPE_CHECKING:
    from datetime import datetime
    from decimal import Decimal

    from optiboul.achats.domain.receptions import StatutFacture
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal

# CdC §3.3 : le gérant paie les fournisseurs, le propriétaire consulte.
PAIENT = frozenset({"gerant"})
MODES = ("especes", "banque", "mobile")


@dataclass(frozen=True)
class EtatFacture:
    id: int
    numero: int
    fournisseur: str
    montant: int
    paye: int
    matiere: str  # la matière livrée (la farine pour la facture de la semaine)
    quantite: Decimal


class DepotFactures(Protocol):
    def verrouiller(self, facture_id: int) -> EtatFacture | None: ...

    def payer(  # noqa: PLR0913
        self,
        facture_id: int,
        *,
        montant: int,
        mode: str,
        reference: str,
        depense: int,
        statut: StatutFacture,
        auteur: int,
        le: datetime,
    ) -> int: ...


class Depenses(Protocol):
    def facture_payee(
        self,
        facture: EtatFacture,
        *,
        montant: int,
        mode: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> int:
        """La dépense « matières » rattachée au stock ; renvoie son identifiant."""
        ...


@dataclass(frozen=True)
class Depots:
    factures: DepotFactures
    depenses: Depenses
    journal: Journal


def payer(  # noqa: PLR0913
    depots: Depots,
    *,
    facture_id: int,
    montant: int,
    mode: str,
    reference: str,
    auteur: Auteur,
    maintenant: datetime,
) -> int:
    """Espèces, banque ou mobile money, en une ou plusieurs fois ; chaque paiement
    crée une dépense rattachée au stock et donne un reçu."""
    if auteur.profil not in PAIENT or auteur.utilisateur_id is None:
        message = "Le gérant paie les fournisseurs."
        raise RefusMetier("droit_insuffisant", message)
    if mode not in MODES:
        message = "Mode de paiement inconnu."
        raise RefusMetier("mode_inconnu", message)
    if mode == "mobile" and not reference.strip():
        message = "La référence de la transaction est obligatoire en mobile money."
        raise RefusMetier("reference_obligatoire", message)
    facture = depots.factures.verrouiller(facture_id)
    if facture is None:
        message = "Facture inconnue."
        raise RefusMetier("facture_inconnue", message)
    statut = statut_apres_paiement(facture.montant, facture.paye, montant)
    depense = depots.depenses.facture_payee(
        facture,
        montant=montant,
        mode=mode,
        auteur=auteur,
        maintenant=maintenant,
    )
    paiement_id = depots.factures.payer(
        facture_id,
        montant=montant,
        mode=mode,
        reference=reference.strip(),
        depense=depense,
        statut=statut,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="facture.payee" if statut == "payee" else "facture.paiement_partiel",
            auteur=auteur,
            objet_type="facture",
            objet_id=str(facture_id),
            apres={
                "paiement": paiement_id,
                "montant": montant,
                "mode": mode,
                "depense": depense,
                "reste": facture.montant - facture.paye - montant,
                "statut": statut,
            },
        ),
    )
    return paiement_id
