"""Contrôles de stock en base et leur demande au propriétaire (US-093, R9, R16)."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.demandes.application import demandes as circuit
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.stocks.application.controles import OUVERTS
from optiboul.stocks.application.controles import Depots
from optiboul.stocks.application.controles import EtatControle
from optiboul.stocks.application.controles import LigneSoumise
from optiboul.stocks.domain.controles import PorteeControle
from optiboul.stocks.domain.controles import StatutControle
from optiboul.stocks.domain.controles import StatutLigne

from .models import ControleStock
from .models import LigneControle
from .models import Matiere
from .stocks import stock

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.semaines import EtatSemaine
    from optiboul.demandes.application.demandes import EtatDemande

INVENTAIRE = "inventaire"
DELAI_DE_DECISION = timedelta(hours=48)


def etat(controle: ControleStock) -> EtatControle:
    return EtatControle(
        id=controle.pk,
        semaine=controle.semaine_id,
        jour=controle.jour,
        portee=PorteeControle(controle.portee),
        statut=StatutControle(controle.statut),
    )


class DepotControlesDjango:
    def creer(
        self,
        semaine: EtatSemaine,
        jour: date,
        portee: PorteeControle,
    ) -> None:
        ControleStock.objects.get_or_create(
            semaine_id=semaine.id,
            jour=jour,
            defaults={
                "portee": portee,
                "gerant_id": semaine.gerant,
                "responsable_production_id": semaine.production,
            },
        )

    def verrouiller(self, controle_id: int) -> EtatControle | None:
        controle = (
            ControleStock.objects.select_for_update().filter(pk=controle_id).first()
        )
        return etat(controle) if controle else None

    def ouverts_du_jour(self, jour: date) -> list[EtatControle]:
        controles = ControleStock.objects.filter(jour=jour, statut__in=OUVERTS)
        return [etat(controle) for controle in controles]

    def ouverts_avant(self, jour: date) -> list[EtatControle]:
        controles = ControleStock.objects.filter(jour__lt=jour, statut__in=OUVERTS)
        return [etat(controle) for controle in controles]

    def marquer(self, controle_id: int, statut: StatutControle) -> None:
        ControleStock.objects.filter(pk=controle_id).update(statut=statut)

    def matieres(self, portee: PorteeControle) -> list[str]:
        matieres = Matiere.objects.filter(stockee=True)
        if portee is PorteeControle.CLES:
            matieres = matieres.filter(cle=True)
        return list(matieres.values_list("code", flat=True))

    def ajouter_ligne(
        self,
        controle_id: int,
        *,
        matiere: str,
        theorique: Decimal,
        compte: Decimal,
        statut: StatutLigne,
    ) -> None:
        LigneControle.objects.create(
            controle_id=controle_id,
            matiere=Matiere.objects.get(code=matiere),
            theorique=theorique,
            compte=compte,
            statut=statut,
        )

    def terminer(self, controle_id: int, *, auteur: int, le: datetime) -> None:
        ControleStock.objects.filter(pk=controle_id).update(
            statut=StatutControle.FAIT,
            fait_par_id=auteur,
            fait_le=le,
        )

    def lignes_soumises(self, controle_id: int) -> list[LigneSoumise]:
        lignes = LigneControle.objects.select_related("matiere").filter(
            controle_id=controle_id,
            statut=StatutLigne.SOUMISE,
        )
        return [
            LigneSoumise(ligne.matiere.code, ligne.compte - ligne.theorique)
            for ligne in lignes
        ]

    def conclure_lignes(self, controle_id: int, statut: StatutLigne) -> None:
        LigneControle.objects.filter(
            controle_id=controle_id,
            statut=StatutLigne.SOUMISE,
        ).update(statut=statut)

    def auteur_de(self, controle_id: int) -> int:
        auteur = ControleStock.objects.get(pk=controle_id).fait_par_id
        assert auteur is not None  # une demande ne part que d'un contrôle fait
        return auteur


def _preparer(controle_id: int, auteur: Auteur) -> ObjetLie:
    lignes = list(
        LigneControle.objects.select_related("matiere", "controle").filter(
            controle_id=controle_id,
            statut=StatutLigne.SOUMISE,
        ),
    )
    if not lignes:
        message = "Aucun écart en attente d'accord."
        raise RefusMetier("objet_inconnu", message)
    return ObjetLie(
        f"Contrôle de stock du {lignes[0].controle.jour:%d/%m}",
        {
            ligne.matiere.code: {
                "theorique": str(ligne.theorique),
                "compte": str(ligne.compte),
            }
            for ligne in lignes
        },
    )


def _conclure(demande: EtatDemande, decideur: Auteur, *, accord: bool) -> None:
    from optiboul.stocks.application.controles import conclure  # noqa: PLC0415

    conclure(depots, controle_id=demande.objet_id, accord=accord, decideur=decideur)


def _echeance(emise_le: datetime) -> datetime:
    """48 h pour l'inventaire (CdC §5.9)."""
    return emise_le + DELAI_DE_DECISION


TYPE_INVENTAIRE = TypeDemande(
    cle=INVENTAIRE,
    libelle="Inventaire avec écart",
    objet_type="controle_stock",
    emetteurs=frozenset({"gerant", "production"}),
    valideurs=lambda profil: ("proprietaire",),
    preparer=_preparer,
    sur_accord=lambda demande, qui: _conclure(demande, qui, accord=True),
    sur_refus=lambda demande, qui: _conclure(demande, qui, accord=False),
    echeance=_echeance,
    lien="/atelier/stocks/controles",
)


class AutorisationsDjango:
    def demander(
        self,
        controle_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        from optiboul.demandes.infrastructure.demandes import depots as depots_demandes  # noqa: PLC0415

        return circuit.emettre(
            depots_demandes,
            type_cle=INVENTAIRE,
            objet_id=controle_id,
            motif=motif,
            auteur=auteur,
            maintenant=maintenant,
        ).code


depots = Depots(
    controles=DepotControlesDjango(),
    stock=stock,
    semaines=depot_semaines,
    journal=journal,
    notificateur=notificateur,
    autorisations=AutorisationsDjango(),
)


def enregistrer() -> None:
    circuit.enregistrer_type(TYPE_INVENTAIRE)
