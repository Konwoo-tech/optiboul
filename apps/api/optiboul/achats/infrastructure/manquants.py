"""Manquants en base et relance du fournisseur par la file d'envoi."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.achats.application.manquants import Depots
from optiboul.achats.application.manquants import EtatManquant
from optiboul.achats.application.manquants import StatutManquant
from optiboul.core.infrastructure.journal import journal
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi

from .models import Manquant
from .models import ReceptionPlanifiee

if TYPE_CHECKING:
    from datetime import date


class DepotManquantsDjango:
    def verrouiller(self, manquant_id: int) -> EtatManquant | None:
        manquant = (
            Manquant.objects.select_for_update(of=("self",))
            .select_related(
                "reception__planifiee__fournisseur",
                "reception__planifiee__matiere",
            )
            .filter(pk=manquant_id)
            .first()
        )
        if manquant is None:
            return None
        planifiee = manquant.reception.planifiee
        return EtatManquant(
            id=manquant.pk,
            fournisseur=planifiee.fournisseur.nom,
            telephone=planifiee.fournisseur.telephone,
            matiere=planifiee.matiere.nom,
            quantite=manquant.quantite,
            statut=StatutManquant(manquant.statut),
        )

    def noter_relance(self, manquant_id: int) -> None:
        manquant = Manquant.objects.get(pk=manquant_id)
        manquant.relances += 1
        manquant.save(update_fields=["relances"])

    def replanifier(self, manquant_id: int, *, prevue_le: date, auteur: int) -> int:
        manquant = Manquant.objects.select_related("reception__planifiee").get(
            pk=manquant_id,
        )
        origine = manquant.reception.planifiee
        nouvelle = ReceptionPlanifiee.objects.create(
            fournisseur_id=origine.fournisseur_id,
            matiere_id=origine.matiere_id,
            quantite=manquant.quantite,
            prevue_le=prevue_le,
            planifiee_par_id=auteur,
        )
        manquant.statut = StatutManquant.REPLANIFIE
        manquant.replanifiee = nouvelle
        manquant.save(update_fields=["statut", "replanifiee"])
        return nouvelle.pk


class EnvoisDjango:
    def relancer(self, manquant: EtatManquant) -> int:
        return file_envoi.mettre_en_file(
            Canal.WHATSAPP,
            manquant.telephone,
            f"Boulangerie du Faubourg : il reste {manquant.quantite} de "
            f"{manquant.matiere} à livrer. Merci de nous indiquer une date.",
            objet_type="manquant",
            objet_id=manquant.id,
        )


depots = Depots(
    manquants=DepotManquantsDjango(),
    envois=EnvoisDjango(),
    journal=journal,
)
