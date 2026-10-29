"""Semaines enregistrées en base (adaptateur du port `DepotSemaines`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model

from optiboul.core.application.semaines import EtatSemaine
from optiboul.core.domain.planning import Creneau
from optiboul.core.domain.semaines import Statut

from .models import CreneauPlanning
from .models import Semaine

if TYPE_CHECKING:
    from datetime import date

    from optiboul.core.domain.planning import Affectations
    from optiboul.core.domain.semaines import Bornes


def etat(semaine: Semaine) -> EtatSemaine:
    return EtatSemaine(
        id=semaine.pk,
        annee=semaine.annee,
        numero=semaine.numero,
        statut=Statut(semaine.statut),
        gerant=semaine.gerant_id,
        production=semaine.production_id,
    )


class DepotSemainesDjango:
    def obtenir(self, semaine_id: int) -> EtatSemaine | None:
        semaine = Semaine.objects.filter(pk=semaine_id).first()
        return etat(semaine) if semaine else None

    def par_numero(self, annee: int, numero: int) -> EtatSemaine | None:
        semaine = Semaine.objects.filter(annee=annee, numero=numero).first()
        return etat(semaine) if semaine else None

    def creer(self, annee: int, numero: int, periode: Bornes, par: int | None) -> int:
        return Semaine.objects.create(
            annee=annee,
            numero=numero,
            debut=periode.debut,
            fin=periode.fin,
            statut=Statut.PLANIFIEE,
            planifiee_par_id=par,
        ).pk

    def affecter(
        self,
        semaine_id: int,
        gerant: int | None,
        production: int | None,
    ) -> None:
        Semaine.objects.filter(pk=semaine_id).update(
            gerant_id=gerant,
            production_id=production,
        )

    def profil(self, utilisateur_id: int) -> str | None:
        utilisateur = get_user_model().objects.filter(pk=utilisateur_id).first()
        return utilisateur.profil if utilisateur else None

    def inactifs(self, ids: set[int]) -> set[int]:
        modele = get_user_model()
        return set(
            modele.objects.filter(pk__in=ids, is_active=False).values_list(
                "pk",
                flat=True,
            ),
        )

    def candidats(self, profil: str) -> list[int]:
        """Personnes actives du profil, par ordre alphabétique (ordre de rotation)."""
        modele = get_user_model()
        personnes = modele.objects.filter(is_active=True).order_by("name", "pk")
        return [p.pk for p in personnes if p.profil == profil]


depot_semaines = DepotSemainesDjango()


class DepotPlanningDjango:
    def lire(self, semaine_id: int) -> Affectations:
        return {
            (ligne.jour, Creneau(ligne.creneau)): ligne.caissiere_id
            for ligne in CreneauPlanning.objects.filter(semaine_id=semaine_id)
        }

    def placer(
        self,
        semaine_id: int,
        jour: date,
        creneau: Creneau,
        caissiere: int | None,
    ) -> None:
        if caissiere is None:
            CreneauPlanning.objects.filter(jour=jour, creneau=creneau).delete()
            return
        CreneauPlanning.objects.update_or_create(
            jour=jour,
            creneau=creneau,
            defaults={"semaine_id": semaine_id, "caissiere_id": caissiere},
        )


depot_planning = DepotPlanningDjango()
