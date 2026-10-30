"""Réceptions et factures fournisseurs en base (adaptateur de `DepotAchats`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import F

from optiboul.achats.application.receptions import Depots
from optiboul.achats.application.receptions import Planifiee
from optiboul.achats.domain.receptions import StatutReception
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import numeros
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.stocks.infrastructure.stocks import stock

from .models import FactureFournisseur
from .models import Manquant
from .models import Reception
from .models import ReceptionPlanifiee

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime
    from decimal import Decimal


class DepotAchatsDjango:
    def verrouiller_planifiee(self, planifiee_id: int) -> Planifiee | None:
        planifiee = (
            ReceptionPlanifiee.objects.select_for_update(of=("self",))
            .select_related("matiere")
            .filter(pk=planifiee_id)
            .first()
        )
        if planifiee is None:
            return None
        return Planifiee(
            id=planifiee.pk,
            fournisseur=planifiee.fournisseur_id,
            matiere=planifiee.matiere.code,
            quantite=planifiee.quantite,
            statut=StatutReception(planifiee.statut),
        )

    def facture_de_farine(self, fournisseur: int, semaine: int) -> int | None:
        facture = (
            FactureFournisseur.objects.select_for_update()
            .filter(fournisseur_id=fournisseur, semaine_id=semaine, farine=True)
            .first()
        )
        return facture.pk if facture else None

    def creer_facture(
        self,
        *,
        numero: int,
        fournisseur: int,
        semaine: int,
        farine: bool,
        echeance: date,
    ) -> int:
        return FactureFournisseur.objects.create(
            numero=numero,
            fournisseur_id=fournisseur,
            semaine_id=semaine,
            farine=farine,
            echeance=echeance,
        ).pk

    def ajouter_a_facture(self, facture_id: int, montant: int) -> None:
        FactureFournisseur.objects.filter(pk=facture_id).update(
            montant=F("montant") + montant,
        )

    def enregistrer(  # noqa: PLR0913
        self,
        planifiee: Planifiee,
        *,
        semaine: int,
        quantite: Decimal,
        observation: str,
        prix_unitaire: int,
        montant: int,
        facture: int,
        auteur: int,
        le: datetime,
    ) -> int:
        ReceptionPlanifiee.objects.filter(pk=planifiee.id).update(
            statut=StatutReception.RECUE,
        )
        return Reception.objects.create(
            planifiee_id=planifiee.id,
            semaine_id=semaine,
            quantite=quantite,
            observation=observation,
            prix_unitaire=prix_unitaire,
            montant=montant,
            facture_id=facture,
            recue_par_id=auteur,
            recue_le=le,
        ).pk

    def noter_manquant(
        self,
        reception_id: int,
        quantite: Decimal,
        *,
        le: datetime,
    ) -> None:
        Manquant.objects.create(
            reception_id=reception_id,
            quantite=quantite,
            cree_le=le,
        )

    def solder_manquant_repris(self, planifiee_id: int) -> None:
        Manquant.objects.filter(replanifiee_id=planifiee_id).update(statut="livre")


depot_achats = DepotAchatsDjango()

depots = Depots(
    achats=depot_achats,
    stock=stock,
    semaines=depot_semaines,
    numeros=numeros,
    journal=journal,
)
