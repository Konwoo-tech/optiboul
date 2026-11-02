"""Suppléments en base et leur demande d'accord au gérant (US-087, R15)."""

from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.parametres import parametre
from optiboul.demandes.application import demandes as circuit
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.production.application.supplements import Depots
from optiboul.production.application.supplements import EtatSupplement
from optiboul.production.application.supplements import Seuils
from optiboul.production.domain.fiches import boules
from optiboul.production.domain.plan import StatutSupplement
from optiboul.stocks.infrastructure.stocks import stock
from optiboul.ventes.domain.commandes import Session

from . import plans
from .models import LignePlanProduction
from .models import SupplementProduction

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur
    from optiboul.demandes.application.demandes import EtatDemande

SUPPLEMENT = "supplement"


def etat(supplement: SupplementProduction) -> EtatSupplement:
    return EtatSupplement(
        id=supplement.pk,
        plan=supplement.plan_id,
        session=Session(supplement.plan.jour, supplement.plan.creneau),
        sacs=dict(supplement.sacs),
        motif=supplement.motif,
        statut=StatutSupplement(supplement.statut),
        farine_necessaire=supplement.farine_necessaire,
        farine_en_stock=supplement.farine_en_stock,
    )


class DepotSupplementsDjango:
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
    ) -> int:
        return SupplementProduction.objects.create(
            plan_id=plan,
            sacs=sacs,
            motif=motif,
            statut=statut,
            farine_necessaire=farine_necessaire,
            farine_en_stock=farine_en_stock,
            auteur_id=auteur,
            cree_le=le,
        ).pk

    def verrouiller(self, supplement_id: int) -> EtatSupplement | None:
        supplement = (
            SupplementProduction.objects.select_for_update(of=("self",))
            .select_related("plan")
            .filter(pk=supplement_id)
            .first()
        )
        return etat(supplement) if supplement else None

    def marquer(
        self,
        supplement_id: int,
        statut: StatutSupplement,
        decide_par: str,
    ) -> None:
        SupplementProduction.objects.filter(pk=supplement_id).update(
            statut=statut,
            decide_par=decide_par,
        )

    def ajouter_au_plan(self, plan_id: int, sacs: dict[str, int]) -> None:
        lignes = LignePlanProduction.objects.select_related("produit", "fiche").filter(
            plan_id=plan_id,
            produit__code__in=sacs,
        )
        for ligne in lignes:
            ligne.supplement += sacs[ligne.produit.code]
            ligne.sacs += sacs[ligne.produit.code]
            ligne.pains_prevus = ligne.sacs * ligne.fiche.pains_par_sac
            ligne.boules = boules(ligne.pains_prevus, ligne.fiche.pains_par_boule)
            ligne.save(update_fields=["supplement", "sacs", "pains_prevus", "boules"])

    def farine_pour(self, plan_id: int, sacs: dict[str, int]) -> Decimal:
        total = Decimal(0)
        lignes = (
            LignePlanProduction.objects.select_related("produit")
            .filter(
                plan_id=plan_id,
                produit__code__in=sacs,
            )
            .prefetch_related("fiche__recette__matiere")
        )
        for ligne in lignes:
            for recette in ligne.fiche.recette.all():
                if recette.matiere.code == "farine":
                    total += recette.quantite * sacs[ligne.produit.code]
        return total


def _preparer(supplement_id: int, auteur: Auteur) -> ObjetLie:
    supplement = (
        SupplementProduction.objects.select_related("plan")
        .filter(pk=supplement_id, statut=StatutSupplement.DEMANDE)
        .first()
    )
    if supplement is None:
        message = "Aucun supplément en attente d'accord."
        raise RefusMetier("objet_inconnu", message)
    plan = supplement.plan
    detail = ", ".join(f"{code} +{n}" for code, n in supplement.sacs.items())
    return ObjetLie(
        f"Plan de {plan.creneau} du {plan.jour:%d/%m} · {detail} sac(s)",
        {
            "sacs": supplement.sacs,
            "motif": supplement.motif,
            "farine_necessaire": str(supplement.farine_necessaire),
            "farine_en_stock": str(supplement.farine_en_stock),
        },
    )


def _conclure(demande: EtatDemande, decideur: Auteur, *, accord: bool) -> None:
    from optiboul.production.application.supplements import conclure  # noqa: PLC0415

    conclure(depots, supplement_id=demande.objet_id, accord=accord, decideur=decideur)


def _echeance(emise_le: datetime) -> datetime:
    """10 minutes, comme la demande de plafond, puis le propriétaire (CdC §5.9)."""
    return emise_le + timedelta(minutes=parametre("echeance_demande_plafond"))


TYPE_SUPPLEMENT = TypeDemande(
    cle=SUPPLEMENT,
    libelle="Augmentation de production après validation",
    objet_type="supplement",
    emetteurs=frozenset({"production"}),
    valideurs=lambda profil: ("gerant", "proprietaire"),
    preparer=_preparer,
    sur_accord=lambda demande, qui: _conclure(demande, qui, accord=True),
    sur_refus=lambda demande, qui: _conclure(demande, qui, accord=False),
    echeance=_echeance,
    lien="/atelier/production",
)


class AutorisationsDjango:
    def demander(
        self,
        supplement_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        from optiboul.demandes.infrastructure.demandes import depots as depots_demandes  # noqa: PLC0415

        return circuit.emettre(
            depots_demandes,
            type_cle=SUPPLEMENT,
            objet_id=supplement_id,
            motif=motif,
            auteur=auteur,
            maintenant=maintenant,
        ).code


def seuils() -> Seuils:
    return Seuils(
        sacs=parametre("supplement_auto_sacs"),
        pourcentage=parametre("supplement_auto_pourcentage"),
    )


depot_supplements = DepotSupplementsDjango()

depots = Depots(
    supplements=depot_supplements,
    plans=plans.depots,
    stock=stock,
    autorisations=AutorisationsDjango(),
)


def enregistrer() -> None:
    circuit.enregistrer_type(TYPE_SUPPLEMENT)
