"""Paie en base (adaptateur de `DepotPaie`) et calcul du net d'une ligne."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.db.models import Sum

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.models import CreneauPlanning
from optiboul.core.infrastructure.parametres import parametre
from optiboul.demandes.application import demandes as circuit
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.paie.application.paies import Depots
from optiboul.paie.application.paies import conclure
from optiboul.paie.domain.paie import PAYABLES
from optiboul.paie.domain.paie import Calcul
from optiboul.paie.domain.paie import GenreElement
from optiboul.paie.domain.paie import StatutPaie
from optiboul.paie.domain.paie import absences_proposees
from optiboul.paie.domain.paie import echeance_validation
from optiboul.paie.domain.paie import mois_precedent
from optiboul.paie.domain.paie import montant_absences

from .models import ElementPaie
from .models import Employe
from .models import EtatPaie
from .models import LignePaie

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.demandes.application.demandes import EtatDemande

PAIE = "paie"


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
        """R12 : le reste du mois précédent devient l'impayé repris, et cet état
        se ferme pour ne pas payer deux fois la même somme."""
        impayes = {}
        precedent = EtatPaie.objects.filter(mois=mois_precedent(mois)).first()
        if precedent is not None and precedent.statut in PAYABLES:
            for ligne in precedent.lignes.all():
                total = calcul_de(ligne).net
                paye = ligne.paiements.aggregate(total=Sum("montant"))["total"] or 0
                if total > paye:
                    impayes[ligne.employe_id] = total - paye
            EtatPaie.objects.filter(pk=precedent.pk).update(statut=StatutPaie.PAYEE)
        etat = EtatPaie.objects.create(mois=mois, prepare_par_id=auteur)
        LignePaie.objects.bulk_create(
            LignePaie(
                etat=etat,
                employe=employe,
                base=employe.salaire_base,
                impaye=impayes.get(employe.pk, 0),
            )
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

    def statut(self, etat_id: int) -> StatutPaie | None:
        etat = EtatPaie.objects.select_for_update().filter(pk=etat_id).first()
        return StatutPaie(etat.statut) if etat else None

    def marquer(self, etat_id: int, statut: StatutPaie) -> None:
        EtatPaie.objects.filter(pk=etat_id).update(statut=statut)

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


def absences_du_mois(etat: EtatPaie, aujourdhui: date) -> dict[int, list[date]]:
    """Pour chaque ligne d'un employé avec un compte, les jours à confirmer."""
    fin = (etat.mois + timedelta(days=31)).replace(day=1)
    proposees = {}
    for ligne in etat.lignes.select_related("employe"):
        compte = ligne.employe.utilisateur_id
        if compte is None:
            continue
        periode = {"jour__gte": etat.mois, "jour__lt": fin, "caissiere_id": compte}
        planifies = CreneauPlanning.objects.filter(**periode)
        ouvertes = Caisse.objects.filter(**periode)
        jours = absences_proposees(
            set(planifies.values_list("jour", "creneau")),
            set(ouvertes.values_list("jour", "creneau")),
            aujourdhui,
        )
        if jours:
            proposees[ligne.pk] = jours
    return proposees


def _preparer(etat_id: int, auteur: Auteur) -> ObjetLie:
    etat = EtatPaie.objects.filter(pk=etat_id, statut=StatutPaie.SOUMIS).first()
    if etat is None:
        raise RefusMetier("objet_inconnu", "Aucun état de paie à valider.")
    lignes = etat.lignes.prefetch_related("elements")
    total = sum(calcul_de(ligne).net for ligne in lignes)
    return ObjetLie(
        f"Paie de {etat.mois:%m/%Y}",
        {"mois": etat.mois.isoformat(), "total_net": total, "lignes": len(lignes)},
    )


def _conclure(demande: EtatDemande, *, accord: bool) -> None:
    conclure(depots, etat_id=demande.objet_id, accord=accord)


def _echeance(emise_le: datetime) -> datetime:
    return echeance_validation(emise_le, parametre("jour_de_paie"))


TYPE_PAIE = TypeDemande(
    cle=PAIE,
    libelle="État de paie",
    objet_type="etat_paie",
    emetteurs=frozenset({"gerant"}),
    valideurs=lambda profil: ("proprietaire",),
    preparer=_preparer,
    sur_accord=lambda demande, qui: _conclure(demande, accord=True),
    sur_refus=lambda demande, qui: _conclure(demande, accord=False),
    echeance=_echeance,
    lien="/gestion/personnel",
)


class AutorisationsDjango:
    def demander(
        self,
        etat_id: int,
        *,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        from optiboul.demandes.infrastructure.demandes import depots as depots_demandes  # noqa: PLC0415

        etat = EtatPaie.objects.get(pk=etat_id)
        return circuit.emettre(
            depots_demandes,
            type_cle=PAIE,
            objet_id=etat_id,
            motif=f"Paie de {etat.mois:%m/%Y} à valider",
            auteur=auteur,
            maintenant=maintenant,
        ).code


depots = Depots(
    paie=DepotPaieDjango(),
    journal=journal,
    autorisations=AutorisationsDjango(),
)


def enregistrer() -> None:
    circuit.enregistrer_type(TYPE_PAIE)
