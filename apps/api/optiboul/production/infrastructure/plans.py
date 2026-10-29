"""Plans de production en base (adaptateurs des ports de `production.application`)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP
from decimal import Decimal
from typing import TYPE_CHECKING

from django.db.models import Q
from django.db.models import Sum

from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.production.application.plans import Depots
from optiboul.production.application.plans import PlanEnregistre
from optiboul.production.domain.plan import VALIDES
from optiboul.production.domain.plan import Rendement
from optiboul.production.domain.plan import StatutPlan
from optiboul.ventes.application import habitudes
from optiboul.ventes.infrastructure.commandes import depots as depots_ventes
from optiboul.ventes.infrastructure.habitudes import historique
from optiboul.ventes.infrastructure.models import LigneCommande
from optiboul.ventes.infrastructure.models import MouvementInterne

from .models import LignePlanProduction
from .models import PlanProduction
from .models import Produit
from .produits import fiche_en_cours

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.production.domain.plan import LignePlan
    from optiboul.ventes.domain.commandes import Session


def _sessions(sessions: list[Session]) -> Q:
    filtre = Q(pk__in=[])
    for session in sessions:
        filtre |= Q(jour=session.jour, creneau=session.creneau)
    return filtre


class DepotPlansDjango:
    def obtenir(self, session: Session) -> PlanEnregistre | None:
        plan = (
            PlanProduction.objects.filter(jour=session.jour, creneau=session.creneau)
            .prefetch_related("lignes__produit")
            .first()
        )
        if plan is None:
            return None
        return PlanEnregistre(
            id=plan.pk,
            statut=StatutPlan(plan.statut),
            sacs={item.produit.code: item.sacs for item in plan.lignes.all()},
            supplement={
                item.produit.code: item.supplement
                for item in plan.lignes.all()
                if item.supplement
            },
            motif=plan.motif_supplement,
        )

    def sacs_valides(self, sessions: list[Session]) -> list[dict[str, int]]:
        plans = PlanProduction.objects.filter(
            _sessions(sessions),
            statut__in=list(VALIDES),
        ).prefetch_related("lignes__produit")
        return [
            {item.produit.code: item.sacs for item in plan.lignes.all()}
            for plan in plans
        ]

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
        plan, _ = PlanProduction.objects.update_or_create(
            jour=session.jour,
            creneau=session.creneau,
            defaults={
                "semaine_id": semaine,
                "statut": StatutPlan.PROPOSE,
                "motif_supplement": motif,
                "propose_par_id": auteur,
                "propose_le": le,
            },
        )
        plan.lignes.all().delete()
        produits = dict(Produit.objects.values_list("code", "pk"))
        LignePlanProduction.objects.bulk_create(
            LignePlanProduction(
                plan=plan,
                produit_id=produits[item.code],
                fiche_id=item.rendement.fiche,
                commandes=item.commandes,
                habituels=item.demande.habituels,
                guichet=item.demande.guichet,
                supplement=item.supplement,
                sacs=item.sacs,
                pains_prevus=item.prevus,
                boules=item.boules,
            )
            for item in lignes
        )
        return plan.pk


class SourcesDjango:
    def rendements(self) -> dict[str, Rendement]:
        resultat = {}
        for produit in Produit.objects.filter(actif=True).order_by("ordre", "code"):
            fiche = fiche_en_cours(produit.pk)
            if fiche is not None:
                resultat[produit.code] = Rendement(
                    fiche=fiche.pk,
                    version=fiche.version,
                    pains_par_sac=fiche.pains_par_sac,
                    pains_par_boule=fiche.pains_par_boule,
                )
        return resultat

    def commandes(self, session: Session) -> dict[str, int]:
        lignes = (
            LigneCommande.objects.filter(
                commande__jour=session.jour,
                commande__creneau=session.creneau,
            )
            .values("produit__code")
            .annotate(pains=Sum("quantite"))
        )
        return {item["produit__code"]: item["pains"] for item in lignes}

    def habituels(self, session: Session, nombre: int) -> dict[str, int]:
        pains: dict[str, int] = {}
        for habituel in habitudes.habituels(
            depots_ventes,
            historique,
            session=session,
            nombre=nombre,
        ):
            for code, quantite in habituel.commande.items():
                pains[code] = pains.get(code, 0) + quantite
        return pains

    def guichet(self, sessions: list[Session]) -> dict[str, int]:
        if not sessions:
            return {}
        filtre = Q(pk__in=[])
        for session in sessions:
            filtre |= Q(caisse__jour=session.jour, caisse__creneau=session.creneau)
        ventes = (
            MouvementInterne.objects.filter(filtre, genre="vente_guichet")
            .values("produit__code")
            .annotate(pains=Sum("quantite"))
        )
        return {
            item["produit__code"]: int(
                (Decimal(item["pains"]) / len(sessions)).quantize(
                    Decimal(1),
                    ROUND_HALF_UP,
                ),
            )
            for item in ventes
        }


def nombre_de_sessions() -> int:
    """Comparaison avec les 4 dernières sessions du même type (paramètre, CdC §9)."""
    return parametre("demande_estimee_sessions")


depot_plans = DepotPlansDjango()
sources = SourcesDjango()

depots = Depots(
    plans=depot_plans,
    sources=sources,
    semaines=depot_semaines,
    journal=journal,
    notificateur=notificateur,
)
