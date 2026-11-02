"""Supplément après la validation du plan (US-087, CdC §5.5, R15, O17)."""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import replace
from decimal import Decimal
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.production.domain.plan import VALIDES
from optiboul.production.domain.plan import StatutSupplement
from optiboul.production.domain.plan import supplement_faible

from .plans import responsable_de
from .plans import verifier_supplement

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.stocks.application.stocks import Stock
    from optiboul.ventes.domain.commandes import Session

    from .plans import Depots as DepotsPlans


@dataclass(frozen=True)
class EtatSupplement:
    id: int
    plan: int
    session: Session
    sacs: dict[str, int]
    motif: str
    statut: StatutSupplement
    farine_necessaire: Decimal
    farine_en_stock: Decimal
    demande: str = ""  # DEM-xxx au-delà du seuil


class DepotSupplements(Protocol):
    def creer(  # noqa: PLR0913
        self,
        *,
        plan: int,
        sacs: dict[str, int],
        motif: str,
        statut: StatutSupplement,
        farine_necessaire: Decimal,
        farine_en_stock: Decimal,
        auteur: int,
        le: datetime,
    ) -> int: ...

    def verrouiller(self, supplement_id: int) -> EtatSupplement | None: ...

    def marquer(
        self,
        supplement_id: int,
        statut: StatutSupplement,
        decide_par: str,
    ) -> None: ...

    def ajouter_au_plan(self, plan_id: int, sacs: dict[str, int]) -> None:
        """Les sacs s'ajoutent aux lignes du plan ; pains prévus et boules suivent."""
        ...

    def farine_pour(self, plan_id: int, sacs: dict[str, int]) -> Decimal:
        """Farine (kg) de ces sacs, selon la version de fiche gardée par le plan."""
        ...


class Autorisations(Protocol):
    def demander(
        self,
        supplement_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str: ...


@dataclass(frozen=True)
class Depots:
    supplements: DepotSupplements
    plans: DepotsPlans
    stock: Stock
    autorisations: Autorisations


@dataclass(frozen=True)
class Seuils:
    """Supplément accordé automatiquement (paramètres, CdC §9)."""

    sacs: int  # par produit
    pourcentage: int  # du plan


def _texte(sacs: dict[str, int]) -> str:
    return ", ".join(f"{code} +{nombre} sac(s)" for code, nombre in sacs.items())


def _annoncer_decision(depots: Depots, etat: EtatSupplement, *, accorde: bool) -> None:
    """Le chef et la caisse apprennent la décision ; le gérant est toujours informé."""
    quand = f"{etat.session.creneau} du {etat.session.jour:%d/%m}"
    titre = f"Supplément {'accordé' if accorde else 'refusé'} ({quand})"
    depots.plans.notificateur.notifier_type(
        "supplement.decision",
        titre=titre,
        message=_texte(etat.sacs),
        lien="/atelier/production",
    )


def ajouter(  # noqa: PLR0913
    depots: Depots,
    *,
    session: Session,
    sacs: dict[str, int],
    motif: str | None,
    auteur: Auteur,
    maintenant: datetime,
    seuils: Seuils,
) -> EtatSupplement:
    """Après validation : supplément faible accordé tout de suite (O17), sinon
    demandé au gérant (R15). Le stock de farine est vérifié."""
    semaine = responsable_de(depots.plans, auteur)
    plan = depots.plans.plans.obtenir(session)
    if plan is None or plan.statut not in VALIDES:
        message = "Avant la validation, le supplément se propose avec le plan."
        raise RefusMetier("plan_non_valide", message)
    sacs = {code: nombre for code, nombre in sacs.items() if nombre}
    motif_retenu = verifier_supplement(
        sacs,
        motif,
        set(depots.plans.sources.rendements()),
    )
    if not sacs:
        message = "Indiquez au moins un sac de supplément."
        raise RefusMetier("supplement_vide", message)
    farine = depots.supplements.farine_pour(plan.id, sacs)
    en_stock = depots.stock.quantites().get("farine", Decimal(0))
    faible = supplement_faible(
        sacs,
        sacs_du_plan=sum(plan.sacs.values()),
        farine_necessaire=farine,
        farine_en_stock=en_stock,
        seuil_sacs=seuils.sacs,
        seuil_pourcentage=seuils.pourcentage,
    )
    statut = StatutSupplement.AUTO_ACCORDE if faible else StatutSupplement.DEMANDE
    assert auteur.utilisateur_id is not None
    supplement_id = depots.supplements.creer(
        plan=plan.id,
        sacs=sacs,
        motif=motif_retenu,
        statut=statut,
        farine_necessaire=farine,
        farine_en_stock=en_stock,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    demande = ""
    if faible:
        depots.supplements.ajouter_au_plan(plan.id, sacs)
    else:
        demande = depots.autorisations.demander(
            supplement_id,
            motif=f"{_texte(sacs)} : {motif_retenu}",
            auteur=auteur,
            maintenant=maintenant,
        )
    etat = depots.supplements.verrouiller(supplement_id)
    assert etat is not None
    depots.plans.journal.enregistrer(
        Evenement(
            action=f"supplement.{statut}",
            auteur=auteur,
            objet_type="supplement",
            objet_id=str(supplement_id),
            apres={
                "plan": plan.id,
                "semaine": semaine.id,
                "sacs": sacs,
                "motif": motif_retenu,
                "farine_necessaire": str(farine),
                "farine_en_stock": str(en_stock),
                "demande": demande,
            },
        ),
    )
    if faible:
        _annoncer_decision(depots, etat, accorde=True)
        gerant = semaine.gerant
        if gerant is not None:
            depots.plans.notificateur.notifier(
                [gerant],
                genre="supplement.decision",
                titre="Supplément accordé automatiquement (O17)",
                message=f"{_texte(sacs)} : {motif_retenu}",
                lien="/atelier/production",
            )
    return replace(etat, demande=demande)


def conclure(
    depots: Depots,
    *,
    supplement_id: int,
    accord: bool,
    decideur: Auteur,
) -> None:
    """La demande tranchée : accordé, les sacs s'ajoutent au plan ; refusé, rien."""
    etat = depots.supplements.verrouiller(supplement_id)
    if etat is None or etat.statut is not StatutSupplement.DEMANDE:
        message = "Ce supplément n'attend plus de décision."
        raise RefusMetier("supplement_non_en_attente", message)
    statut = StatutSupplement.ACCORDE if accord else StatutSupplement.REFUSE
    if accord:
        depots.supplements.ajouter_au_plan(etat.plan, etat.sacs)
    depots.supplements.marquer(supplement_id, statut, decideur.nom)
    depots.plans.journal.enregistrer(
        Evenement(
            action=f"supplement.{statut}",
            auteur=decideur,
            objet_type="supplement",
            objet_id=str(supplement_id),
            avant={"statut": StatutSupplement.DEMANDE},
            apres={"statut": statut, "sacs": etat.sacs},
        ),
    )
    _annoncer_decision(depots, etat, accorde=accord)
