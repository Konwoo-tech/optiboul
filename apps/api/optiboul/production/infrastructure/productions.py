"""Productions en base (adaptateur du port `DepotProductions`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import Sum

from optiboul.production.application.productions import Depots
from optiboul.production.application.productions import EtatProduction
from optiboul.production.domain.production import StatutProduction
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.stocks import stock
from optiboul.ventes.domain.commandes import Session

from . import plans
from .models import Consommation
from .models import Fournee
from .models import Production
from .models import Produit

if TYPE_CHECKING:
    from datetime import datetime
    from decimal import Decimal


def etat(production: Production) -> EtatProduction:
    lignes = production.plan.lignes.select_related("produit", "fiche").prefetch_related(
        "fiche__recette__matiere",
    )
    recettes = {}
    matieres = set()
    for ligne in lignes:
        recettes[ligne.produit.code] = {
            r.matiere.code: r.quantite for r in ligne.fiche.recette.all()
        }
        if ligne.sacs:
            matieres |= {
                r.matiere.code for r in ligne.fiche.recette.all() if r.matiere.stockee
            }
    realise = dict(
        production.fournees.values_list("produit__code")
        .annotate(pains=Sum("pains"))
        .values_list("produit__code", "pains"),
    )
    return EtatProduction(
        id=production.pk,
        semaine=production.semaine_id,
        session=Session(production.plan.jour, production.plan.creneau),
        statut=StatutProduction(production.statut),
        sacs={ligne.produit.code: ligne.sacs for ligne in lignes},
        prevus={ligne.produit.code: ligne.pains_prevus for ligne in lignes},
        realise=realise,
        consommation={
            c.matiere.code: c.quantite
            for c in production.consommations.select_related("matiere")
        },
        recettes=recettes,
        matieres=matieres,
    )


class DepotProductionsDjango:
    def de_la_session(self, session: Session) -> EtatProduction | None:
        production = (
            Production.objects.select_related("plan")
            .filter(plan__jour=session.jour, plan__creneau=session.creneau)
            .first()
        )
        return etat(production) if production else None

    def verrouiller(self, production_id: int) -> EtatProduction | None:
        production = (
            Production.objects.select_for_update(of=("self",))
            .select_related("plan")
            .filter(pk=production_id)
            .first()
        )
        return etat(production) if production else None

    def ouvrir(self, plan_id: int, *, semaine: int, auteur: int, le: datetime) -> int:
        return Production.objects.create(
            plan_id=plan_id,
            semaine_id=semaine,
            ouverte_par_id=auteur,
            ouverte_le=le,
        ).pk

    def ajouter_fournee(
        self,
        production_id: int,
        *,
        code: str,
        pains: int,
        auteur: int,
        le: datetime,
    ) -> None:
        Fournee.objects.create(
            production_id=production_id,
            produit=Produit.objects.get(code=code),
            pains=pains,
            auteur_id=auteur,
            cree_le=le,
        )

    def consommer(
        self,
        production_id: int,
        quantites: dict[str, Decimal],
        *,
        auteur: int,
        le: datetime,
    ) -> None:
        matieres = dict(Matiere.objects.values_list("code", "pk"))
        for code, quantite in quantites.items():
            Consommation.objects.update_or_create(
                production_id=production_id,
                matiere_id=matieres[code],
                defaults={
                    "quantite": quantite,
                    "saisie_par_id": auteur,
                    "modifiee_le": le,
                },
            )

    def cloturer(self, production_id: int, *, auteur: int, le: datetime) -> None:
        Production.objects.filter(pk=production_id).update(
            statut=StatutProduction.CLOTUREE,
            cloturee_par_id=auteur,
            cloturee_le=le,
        )

    def matieres_connues(self) -> set[str]:
        return set(Matiere.objects.values_list("code", flat=True))


depot_productions = DepotProductionsDjango()

depots = Depots(productions=depot_productions, plans=plans.depots, stock=stock)
