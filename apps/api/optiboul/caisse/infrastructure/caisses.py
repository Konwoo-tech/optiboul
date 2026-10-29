"""Caisses enregistrées en base (adaptateur du port `DepotCaisses`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.caisse.application.caisses import Depots
from optiboul.caisse.application.caisses import EtatCaisse
from optiboul.caisse.domain.caisses import GenreMouvement
from optiboul.caisse.domain.caisses import StatutCaisse
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.semaines import depot_planning
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.notifications.infrastructure.envois import notificateur

from .models import Caisse
from .models import MouvementCaisse

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime

    from optiboul.caisse.domain.regles import ResultatFermeture


def etat(caisse: Caisse) -> EtatCaisse:
    return EtatCaisse(
        id=caisse.pk,
        semaine=caisse.semaine_id,
        jour=caisse.jour,
        creneau=caisse.creneau,
        caissiere=caisse.caissiere_id,
        fonds=caisse.fonds,
        statut=StatutCaisse(caisse.statut),
    )


class DepotCaissesDjango:
    def obtenir(self, caisse_id: int) -> EtatCaisse | None:
        caisse = Caisse.objects.filter(pk=caisse_id).first()
        return etat(caisse) if caisse else None

    def en_cours(self) -> EtatCaisse | None:
        caisse = Caisse.objects.filter(en_cours=True).first()
        return etat(caisse) if caisse else None

    def du_creneau(self, jour: date, creneau: str) -> EtatCaisse | None:
        caisse = Caisse.objects.filter(jour=jour, creneau=creneau).first()
        return etat(caisse) if caisse else None

    def ouvrir(  # noqa: PLR0913
        self,
        *,
        semaine: int,
        jour: date,
        creneau: str,
        caissiere: int,
        planifiee: int | None,
        fonds: int,
        le: datetime,
    ) -> int:
        return Caisse.objects.create(
            semaine_id=semaine,
            jour=jour,
            creneau=creneau,
            caissiere_id=caissiere,
            planifiee_id=planifiee,
            hors_planning=planifiee != caissiere,
            fonds=fonds,
            statut=StatutCaisse.OUVERTE,
            en_cours=True,
            ouverte_le=le,
        ).pk

    def verrouiller(self, caisse_id: int) -> EtatCaisse | None:
        caisse = Caisse.objects.select_for_update().filter(pk=caisse_id).first()
        return etat(caisse) if caisse else None

    def mouvements(self, caisse_id: int) -> list[tuple[GenreMouvement, int]]:
        lignes = MouvementCaisse.objects.filter(caisse_id=caisse_id)
        return [(GenreMouvement(m.genre), m.montant) for m in lignes]

    def ajouter_mouvement(  # noqa: PLR0913
        self,
        caisse_id: int,
        *,
        genre: GenreMouvement,
        montant: int,
        auteur: int,
        libelle: str,
        receveur: int | None,
    ) -> None:
        MouvementCaisse.objects.create(
            caisse_id=caisse_id,
            genre=genre,
            montant=montant,
            auteur_id=auteur,
            libelle=libelle,
            receveur_id=receveur,
        )

    def fermer(self, caisse_id: int, resultat: ResultatFermeture, le: datetime) -> None:
        Caisse.objects.filter(pk=caisse_id).update(
            statut=StatutCaisse.FERMEE,
            en_cours=False,
            attendu=resultat.attendu,
            compte=resultat.compte,
            ecart=resultat.ecart,
            fermee_le=le,
        )


depot_caisses = DepotCaissesDjango()

depots = Depots(
    caisses=depot_caisses,
    semaines=depot_semaines,
    planning=depot_planning,
    journal=journal,
    notificateur=notificateur,
)
