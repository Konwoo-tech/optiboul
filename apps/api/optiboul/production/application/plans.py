"""Cas d'usage du plan de production (US-081, CdC §5.5, R4)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.production.domain.plan import StatutPlan
from optiboul.production.domain.plan import ligne
from optiboul.production.domain.plan import moyenne
from optiboul.production.domain.plan import moyennes_par_produit
from optiboul.ventes.domain.habitudes import sessions_precedentes

if TYPE_CHECKING:
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.semaines import DepotSemaines
    from optiboul.core.application.semaines import EtatSemaine
    from optiboul.notifications.application.ports import Notificateur
    from optiboul.production.domain.plan import LignePlan
    from optiboul.production.domain.plan import Rendement
    from optiboul.ventes.domain.commandes import Session


@dataclass(frozen=True)
class PlanEnregistre:
    id: int
    statut: StatutPlan
    sacs: dict[str, int]


class DepotPlans(Protocol):
    def obtenir(self, session: Session) -> PlanEnregistre | None: ...

    def sacs_valides(self, sessions: list[Session]) -> list[dict[str, int]]:
        """Sacs par produit des plans validés (ou provisoires) de ces sessions."""
        ...

    def enregistrer(
        self,
        *,
        session: Session,
        semaine: int,
        lignes: list[LignePlan],
        auteur: int,
        le: datetime,
    ) -> int:
        """Crée le plan proposé de la session, ou remplace ses lignes."""
        ...


class Sources(Protocol):
    def rendements(self) -> dict[str, Rendement]:
        """Produits actifs et version en cours de leur fiche."""
        ...

    def commandes(self, session: Session) -> dict[str, int]:
        """Pains commandés par produit pour la session."""
        ...


@dataclass(frozen=True)
class Depots:
    plans: DepotPlans
    sources: Sources
    semaines: DepotSemaines
    journal: Journal
    notificateur: Notificateur


@dataclass(frozen=True)
class PlanCalcule:
    session: Session
    lignes: list[LignePlan]
    sacs: int
    prevus: int
    moyenne_sacs: Decimal | None  # total des dernières sessions du même type
    enregistre: PlanEnregistre | None


def calculer(depots: Depots, *, session: Session, nombre: int) -> PlanCalcule:
    """Sacs, pains et boules par produit depuis les commandes, comparés aux N
    dernières sessions du même type (R4)."""
    historique = depots.plans.sacs_valides(sessions_precedentes(session, nombre))
    moyennes = moyennes_par_produit(historique)
    commandes = depots.sources.commandes(session)
    lignes = [
        ligne(code, rendement, commandes.get(code, 0), moyennes.get(code))
        for code, rendement in depots.sources.rendements().items()
    ]
    return PlanCalcule(
        session=session,
        lignes=lignes,
        sacs=sum(item.sacs for item in lignes),
        prevus=sum(item.prevus for item in lignes),
        moyenne_sacs=moyenne([sum(plan.values()) for plan in historique]),
        enregistre=depots.plans.obtenir(session),
    )


def responsable_de(depots: Depots, auteur: Auteur) -> EtatSemaine:
    """Le responsable de production de la semaine ouverte (CdC §3.3)."""
    semaine = depots.semaines.ouverte()
    if semaine is None:
        message = "Aucune semaine n'est ouverte (R1)."
        raise RefusMetier("semaine_non_ouverte", message)
    if auteur.profil != "production" or auteur.utilisateur_id != semaine.production:
        message = "Seul le responsable de production de la semaine propose le plan."
        raise RefusMetier("droit_insuffisant", message)
    return semaine


def proposer(
    depots: Depots,
    *,
    session: Session,
    nombre: int,
    auteur: Auteur,
    maintenant: datetime,
) -> PlanCalcule:
    """Le plan calculé devient le plan proposé de la session ; le gérant est prévenu."""
    semaine = responsable_de(depots, auteur)
    existant = depots.plans.obtenir(session)
    if existant is not None and existant.statut is not StatutPlan.PROPOSE:
        message = "Le plan de cette session est déjà validé."
        raise RefusMetier("plan_deja_valide", message)
    plan = calculer(depots, session=session, nombre=nombre)
    if plan.sacs == 0:
        message = "Aucun sac à pétrir : il n'y a pas encore de commande."
        raise RefusMetier("plan_vide", message)
    assert auteur.utilisateur_id is not None
    plan_id = depots.plans.enregistrer(
        session=session,
        semaine=semaine.id,
        lignes=plan.lignes,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="plan.propose",
            auteur=auteur,
            objet_type="plan",
            objet_id=str(plan_id),
            avant={"sacs": existant.sacs} if existant else None,
            apres={
                "jour": session.jour.isoformat(),
                "creneau": session.creneau,
                "sacs": {item.code: item.sacs for item in plan.lignes if item.sacs},
            },
        ),
    )
    depots.notificateur.notifier_type(
        "plan.propose",
        titre=f"Plan de {session.creneau} du {session.jour:%d/%m} proposé",
        message=f"{plan.sacs} sacs, {plan.prevus} pains prévus.",
        lien="/atelier/production",
    )
    return calculer(depots, session=session, nombre=nombre)
