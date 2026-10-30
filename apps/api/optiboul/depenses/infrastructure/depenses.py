"""Dépenses en base (adaptateur du port `DepotDepenses`)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from optiboul.caisse.infrastructure.caisses import depot_caisses
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import numeros
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.depenses.application.depenses import Depots
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.stocks import stock

from .models import Depense

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.depenses.domain.depenses import NouvelleDepense
    from optiboul.depenses.domain.depenses import StatutDepense
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
            auteur_id=auteur.utilisateur_id,
            auteur_profil=auteur.profil,
            cree_le=le,
        ).pk


depot_depenses = DepotDepensesDjango()

depots = Depots(
    depenses=depot_depenses,
    caisses=depot_caisses,
    stock=stock,
    semaines=depot_semaines,
    numeros=numeros,
    journal=journal,
)
