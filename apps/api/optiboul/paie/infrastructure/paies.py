"""Paie en base (adaptateur de `DepotPaie`) et calcul du net d'une ligne."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.core.infrastructure.journal import journal
from optiboul.paie.application.paies import Depots
from optiboul.paie.domain.paie import Calcul
from optiboul.paie.domain.paie import GenreElement
from optiboul.paie.domain.paie import StatutPaie
from optiboul.paie.domain.paie import montant_absences

from .models import ElementPaie
from .models import Employe
from .models import EtatPaie
from .models import LignePaie

if TYPE_CHECKING:
    from datetime import date
    from decimal import Decimal


def calcul_de(ligne: LignePaie) -> Calcul:
    elements = list(ligne.elements.all())
    return Calcul(
        base=ligne.base,
        absences=montant_absences(ligne.base, ligne.absences),
        avances=ligne.avances,
        penalites=sum(e.montant for e in elements if e.genre == GenreElement.PENALITE),
        gains=sum(e.montant for e in elements if e.genre == GenreElement.GAIN),
        impaye=ligne.impaye,
    )


class DepotPaieDjango:
    def existe(self, mois: date) -> bool:
        return EtatPaie.objects.filter(mois=mois).exists()

    def creer(self, mois: date, *, auteur: int) -> int:
        etat = EtatPaie.objects.create(mois=mois, prepare_par_id=auteur)
        LignePaie.objects.bulk_create(
            LignePaie(etat=etat, employe=employe, base=employe.salaire_base)
            for employe in Employe.objects.filter(actif=True)
        )
        return etat.pk

    def statut_de_la_ligne(self, ligne_id: int) -> StatutPaie | None:
        statut = (
            LignePaie.objects.filter(pk=ligne_id)
            .values_list("etat__statut", flat=True)
            .first()
        )
        return StatutPaie(statut) if statut else None

    def modifier_ligne(
        self,
        ligne_id: int,
        *,
        absences: Decimal,
        avances: int,
    ) -> None:
        LignePaie.objects.filter(pk=ligne_id).update(
            absences=absences,
            avances=avances,
        )

    def ajouter_element(  # noqa: PLR0913
        self,
        ligne_id: int,
        *,
        genre: GenreElement,
        description: str,
        montant: int,
        jour: date,
        auteur: int,
    ) -> int:
        return ElementPaie.objects.create(
            ligne_id=ligne_id,
            genre=genre,
            description=description,
            montant=montant,
            jour=jour,
            auteur_id=auteur,
        ).pk

    def ligne_de_l_element(self, element_id: int) -> int | None:
        return (
            ElementPaie.objects.filter(pk=element_id)
            .values_list("ligne_id", flat=True)
            .first()
        )

    def modifier_element(
        self,
        element_id: int,
        *,
        description: str,
        montant: int,
    ) -> None:
        ElementPaie.objects.filter(pk=element_id).update(
            description=description,
            montant=montant,
        )

    def retirer_element(self, element_id: int) -> None:
        ElementPaie.objects.filter(pk=element_id).delete()


depots = Depots(paie=DepotPaieDjango(), journal=journal)
