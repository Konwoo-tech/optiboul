"""Demandes en base (adaptateurs des ports de `demandes.application`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model

from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import numeros
from optiboul.demandes.application.demandes import Depots
from optiboul.demandes.application.demandes import EtatDemande
from optiboul.demandes.domain.demandes import StatutDemande
from optiboul.demandes.domain.demandes import Via
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi
from optiboul.notifications.infrastructure.envois import notificateur

from .models import Demande

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.demandes.application.demandes import ObjetLie
    from optiboul.demandes.application.demandes import TypeDemande


def etat(demande: Demande) -> EtatDemande:
    return EtatDemande(
        id=demande.pk,
        numero=demande.numero,
        type=demande.type,
        objet_type=demande.objet_type,
        objet_id=demande.objet_id,
        objet=demande.objet,
        details=demande.details,
        motif=demande.motif,
        emetteur=demande.emetteur_id,
        emetteur_profil=demande.emetteur_profil,
        valideurs=tuple(demande.valideurs),
        statut=StatutDemande(demande.statut),
    )


class DepotDemandesDjango:
    def creer(  # noqa: PLR0913
        self,
        *,
        numero: int,
        type_demande: TypeDemande,
        objet_id: int,
        objet: ObjetLie,
        motif: str,
        valideurs: tuple[str, ...],
        echeance: datetime | None,
        auteur: Auteur,
        le: datetime,
    ) -> int:
        return Demande.objects.create(
            numero=numero,
            type=type_demande.cle,
            objet_type=type_demande.objet_type,
            objet_id=objet_id,
            objet=objet.libelle,
            details=objet.details,
            motif=motif,
            emetteur_id=auteur.utilisateur_id,
            emetteur_nom=auteur.nom,
            emetteur_profil=auteur.profil,
            valideurs=list(valideurs),
            echeance=echeance,
            cree_le=le,
        ).pk

    def obtenir(self, demande_id: int) -> EtatDemande | None:
        demande = Demande.objects.filter(pk=demande_id).first()
        return etat(demande) if demande else None

    def en_attente_pour(self, type_cle: str, objet_id: int) -> EtatDemande | None:
        demande = Demande.objects.filter(
            type=type_cle,
            objet_id=objet_id,
            statut=StatutDemande.EN_ATTENTE,
        ).first()
        return etat(demande) if demande else None

    def verrouiller(self, demande_id: int) -> EtatDemande | None:
        demande = Demande.objects.select_for_update().filter(pk=demande_id).first()
        return etat(demande) if demande else None

    def echues(self, maintenant: datetime) -> list[EtatDemande]:
        demandes = Demande.objects.filter(
            statut=StatutDemande.EN_ATTENTE,
            echeance__lte=maintenant,
            escaladee_le=None,
        ).order_by("echeance", "id")
        return [etat(demande) for demande in demandes]

    def escalader(self, demande_id: int, le: datetime) -> None:
        demande = Demande.objects.select_for_update().get(pk=demande_id)
        demande.escaladee_le = le
        if "proprietaire" not in demande.valideurs:
            demande.valideurs = [*demande.valideurs, "proprietaire"]
        demande.save(update_fields=["escaladee_le", "valideurs"])

    def decider(  # noqa: PLR0913
        self,
        demande_id: int,
        *,
        statut: StatutDemande,
        decideur: Auteur,
        via: Via,
        motif_refus: str,
        le: datetime,
    ) -> None:
        Demande.objects.filter(pk=demande_id).update(
            statut=statut,
            decide_par_id=decideur.utilisateur_id,
            decide_par_nom=decideur.nom,
            decide_le=le,
            motif_refus=motif_refus,
            via=via,
        )


class TelephonesDjango:
    def prevenir(self, profils: tuple[str, ...], message: str) -> None:
        """SMS ou WhatsApp selon le canal de chaque valideur ; sans numéro, rien."""
        for utilisateur in (
            get_user_model()
            .objects.filter(is_active=True)
            .exclude(
                telephone="",
            )
        ):
            if utilisateur.profil in profils:
                file_envoi.mettre_en_file(
                    Canal(utilisateur.canal_verification),
                    utilisateur.telephone,
                    message,
                )


depot_demandes = DepotDemandesDjango()
telephones = TelephonesDjango()

depots = Depots(
    demandes=depot_demandes,
    numeros=numeros,
    journal=journal,
    notificateur=notificateur,
    telephones=telephones,
)
