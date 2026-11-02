"""Dépenses en base (adaptateur du port `DepotDepenses`)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db.models import Sum

from optiboul.caisse.infrastructure.caisses import depot_caisses
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import numeros
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.depenses.application.depenses import DepenseSoumise
from optiboul.depenses.application.depenses import Depots
from optiboul.depenses.domain.depenses import Categorie
from optiboul.depenses.domain.depenses import NouvelleDepense
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.domain.depenses import StatutDepense
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.stocks import stock

from .autorisations import autorisations
from .models import Depense
from .models import PreAutorisation

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.ventes.domain.commandes import Session


class DepotDepensesDjango:
    def creer(  # noqa: PLR0913
        self,
        *,
        numero: int,
        semaine: int,
        depense: NouvelleDepense,
        caisse: int | None,
        session: Session | None,
        statut: StatutDepense,
        pre_autorisation: int | None,
        justificatif: Any,
        auteur: Auteur,
        le: datetime,
    ) -> int:
        assert auteur.utilisateur_id is not None
        return Depense.objects.create(
            numero=numero,
            semaine_id=semaine,
            categorie=depense.categorie,
            libelle=depense.libelle.strip(),
            montant=depense.montant,
            paye_par=depense.paye_par,
            caisse_id=caisse,
            rattachement=depense.rattachement,
            production_jour=session.jour if session else None,
            production_creneau=session.creneau if session else "",
            matiere=Matiere.objects.filter(code=depense.matiere).first()
            if depense.matiere
            else None,
            quantite=depense.quantite,
            fournisseur=depense.fournisseur.strip(),
            justificatif=justificatif or "",
            statut=statut,
            achat_courant=depense.achat_courant,
            pre_autorisation_id=pre_autorisation,
            auteur_id=auteur.utilisateur_id,
            auteur_profil=auteur.profil,
            cree_le=le,
        ).pk

    def pre_autorisation(
        self,
        semaine: int,
        achat_courant: str,
    ) -> tuple[int, int, int] | None:
        pre = (
            PreAutorisation.objects.select_for_update()
            .filter(semaine_id=semaine, achat_courant=achat_courant)
            .first()
        )
        if pre is None:
            return None
        return pre.pk, pre.plafond, engage(pre)

    def fixer_plafonds(
        self,
        semaine: int,
        plafonds: dict[str, int],
        auteur: int,
    ) -> None:
        for achat, plafond in plafonds.items():
            if plafond:
                PreAutorisation.objects.update_or_create(
                    semaine_id=semaine,
                    achat_courant=achat,
                    defaults={"plafond": plafond, "fixe_par_id": auteur},
                )
            else:
                PreAutorisation.objects.filter(
                    semaine_id=semaine,
                    achat_courant=achat,
                    depenses=None,
                ).delete()

    def plafonds(self, semaine: int) -> dict[str, int]:
        return dict(
            PreAutorisation.objects.filter(semaine_id=semaine).values_list(
                "achat_courant",
                "plafond",
            ),
        )

    def verrouiller_soumise(self, depense_id: int) -> DepenseSoumise | None:
        depense = (
            Depense.objects.select_for_update(of=("self",))
            .select_related("matiere")
            .filter(pk=depense_id, statut=StatutDepense.EN_ATTENTE)
            .first()
        )
        if depense is None:
            return None
        return DepenseSoumise(
            depense=NouvelleDepense(
                categorie=Categorie(depense.categorie),
                libelle=depense.libelle,
                montant=depense.montant,
                paye_par=PayePar(depense.paye_par),
                rattachement=Rattachement(depense.rattachement),
                matiere=depense.matiere.code if depense.matiere else "",
                quantite=depense.quantite,
                fournisseur=depense.fournisseur,
                achat_courant=depense.achat_courant,
            ),
            numero=depense.numero,
            caisse=depense.caisse_id,
            semaine=depense.semaine_id,
            auteur=depense.auteur_id,
        )

    def marquer(self, depense_id: int, statut: StatutDepense) -> None:
        Depense.objects.filter(pk=depense_id).update(statut=statut)


def engage(pre: PreAutorisation) -> int:
    """Dépenses non refusées rattachées à la pré-autorisation, en FCFA."""
    return (
        pre.depenses.exclude(statut="refusee").aggregate(total=Sum("montant"))["total"]
        or 0
    )


depot_depenses = DepotDepensesDjango()

depots = Depots(
    depenses=depot_depenses,
    caisses=depot_caisses,
    stock=stock,
    semaines=depot_semaines,
    numeros=numeros,
    journal=journal,
    autorisations=autorisations,
)
