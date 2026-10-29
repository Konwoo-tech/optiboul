"""Cas d'usage du plan de production (US-081, US-086, CdC §5.5, R4)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.production.domain.plan import Demande
from optiboul.production.domain.plan import MotifSupplement
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
    supplement: dict[str, int]
    motif: str


class DepotPlans(Protocol):
    def obtenir(self, session: Session) -> PlanEnregistre | None: ...

    def sacs_valides(self, sessions: list[Session]) -> list[dict[str, int]]:
        """Sacs par produit des plans validés (ou provisoires) de ces sessions."""
        ...

    def enregistrer(  # noqa: PLR0913
        self,
        *,
        session: Session,
        semaine: int,
        lignes: list[LignePlan],
        motif: str,
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

    def habituels(self, session: Session, nombre: int) -> dict[str, int]:
        """Pains habituels des clients qui n'ont pas encore commandé (O18)."""
        ...

    def guichet(self, sessions: list[Session]) -> dict[str, int]:
        """Ventes au guichet par produit, moyenne arrondie sur ces sessions."""
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

    @property
    def alerte(self) -> bool:
        """La demande estimée dépasse le plan pour au moins un produit (CdC §5.13)."""
        return any(item.au_dessus_du_plan for item in self.lignes)


def calculer(
    depots: Depots,
    *,
    session: Session,
    nombre: int,
    supplement: dict[str, int] | None = None,
) -> PlanCalcule:
    """Les trois sources du plan, chacune affichée : commandes, demande estimée
    (habituels sans commande, guichet moyen des N dernières sessions du même type)
    et supplément du chef ; comparées aux N dernières sessions (R4)."""
    passees = sessions_precedentes(session, nombre)
    historique = depots.plans.sacs_valides(passees)
    moyennes = moyennes_par_produit(historique)
    enregistre = depots.plans.obtenir(session)
    if supplement is None:
        supplement = enregistre.supplement if enregistre else {}
    commandes = depots.sources.commandes(session)
    habituels = depots.sources.habituels(session, nombre)
    guichet = depots.sources.guichet(passees)
    lignes = [
        ligne(
            code,
            rendement,
            Demande(
                commandes.get(code, 0),
                habituels.get(code, 0),
                guichet.get(code, 0),
            ),
            moyennes.get(code),
            supplement.get(code, 0),
        )
        for code, rendement in depots.sources.rendements().items()
    ]
    return PlanCalcule(
        session=session,
        lignes=lignes,
        sacs=sum(item.sacs for item in lignes),
        prevus=sum(item.prevus for item in lignes),
        moyenne_sacs=moyenne([sum(plan.values()) for plan in historique]),
        enregistre=enregistre,
    )


def verifier_supplement(
    supplement: dict[str, int],
    motif: str | None,
    produits: set[str],
) -> str:
    """Des sacs entiers positifs de produits connus ; un motif dès qu'il y en a."""
    if inconnus := sorted(set(supplement) - produits):
        message = f"Produits inconnus ou inactifs : {', '.join(inconnus)}."
        raise RefusMetier("produit_inconnu", message, produits=inconnus)
    if any(sacs < 0 for sacs in supplement.values()):
        message = "Le supplément se compte en sacs positifs."
        raise RefusMetier("quantite_invalide", message)
    if not any(supplement.values()):
        return ""
    if motif not in {m.value for m in MotifSupplement}:
        message = "Le motif du supplément est obligatoire (habituels, guichet…)."
        raise RefusMetier("motif_obligatoire", message)
    return motif


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


def proposer(  # noqa: PLR0913
    depots: Depots,
    *,
    session: Session,
    nombre: int,
    auteur: Auteur,
    maintenant: datetime,
    supplement: dict[str, int] | None = None,
    motif: str | None = None,
) -> PlanCalcule:
    """Le plan calculé, avec le supplément du chef, devient le plan proposé ; le
    gérant est prévenu, et l'alerte part si la demande estimée dépasse le plan."""
    semaine = responsable_de(depots, auteur)
    existant = depots.plans.obtenir(session)
    if existant is not None and existant.statut is not StatutPlan.PROPOSE:
        message = "Le plan de cette session est déjà validé."
        raise RefusMetier("plan_deja_valide", message)
    supplement = {code: sacs for code, sacs in (supplement or {}).items() if sacs}
    motif_retenu = verifier_supplement(
        supplement,
        motif,
        set(depots.sources.rendements()),
    )
    plan = calculer(depots, session=session, nombre=nombre, supplement=supplement)
    if plan.sacs == 0:
        message = "Aucun sac à pétrir : il n'y a pas encore de commande."
        raise RefusMetier("plan_vide", message)
    assert auteur.utilisateur_id is not None
    plan_id = depots.plans.enregistrer(
        session=session,
        semaine=semaine.id,
        lignes=plan.lignes,
        motif=motif_retenu,
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
                "supplement": supplement,
                "motif": motif_retenu,
            },
        ),
    )
    if plan.alerte:
        depassements = ", ".join(
            f"{item.code} {item.demande.estimee} pains pour {item.prevus}"
            for item in plan.lignes
            if item.au_dessus_du_plan
        )
        depots.notificateur.notifier_type(
            "plan.demande_superieure",
            titre=f"Demande estimée au-dessus du plan ({session.creneau})",
            message=depassements,
            lien="/atelier/production",
        )
    depots.notificateur.notifier_type(
        "plan.propose",
        titre=f"Plan de {session.creneau} du {session.jour:%d/%m} proposé",
        message=f"{plan.sacs} sacs, {plan.prevus} pains prévus.",
        lien="/atelier/production",
    )
    return calculer(depots, session=session, nombre=nombre)
