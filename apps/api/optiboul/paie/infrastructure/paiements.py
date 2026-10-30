"""Paiements de salaires en base, dépense « Salaires » et bulletin PDF (US-124)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import Sum
from django.template.loader import render_to_string
from django.utils import timezone

from optiboul.core.infrastructure.journal import journal
from optiboul.depenses.application import depenses as cas_depenses
from optiboul.depenses.domain.depenses import Categorie
from optiboul.depenses.domain.depenses import NouvelleDepense
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.infrastructure.depenses import depots as depots_depenses
from optiboul.paie.application.paiements import Depots
from optiboul.paie.application.paiements import EtatLigne
from optiboul.paie.domain.paie import StatutPaie
from optiboul.production.domain.plan import session_de_production
from optiboul.ventes.infrastructure.commandes import limites

from .models import EtatPaie
from .models import LignePaie
from .models import PaiementSalaire
from .paies import calcul_de

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur

PAYE_PAR = {
    "especes": PayePar.CAISSE,
    "banque": PayePar.BANQUE,
    "mobile": PayePar.MOBILE,
}


def deja_paye(ligne: LignePaie) -> int:
    return ligne.paiements.aggregate(total=Sum("montant"))["total"] or 0


def reste_de(ligne: LignePaie) -> int:
    return calcul_de(ligne).net - deja_paye(ligne)


class DepotPaiementsDjango:
    def verrouiller_ligne(self, ligne_id: int) -> EtatLigne | None:
        ligne = (
            LignePaie.objects.select_for_update(of=("self",))
            .select_related("etat", "employe")
            .filter(pk=ligne_id)
            .first()
        )
        if ligne is None:
            return None
        return EtatLigne(
            id=ligne.pk,
            etat=ligne.etat_id,
            statut=StatutPaie(ligne.etat.statut),
            mois=ligne.etat.mois,
            employe=ligne.employe.nom,
            net=calcul_de(ligne).net,
            paye=deja_paye(ligne),
        )

    def lignes_restantes(self, etat_id: int) -> list[int]:
        lignes = LignePaie.objects.filter(etat_id=etat_id)
        return [ligne.pk for ligne in lignes if reste_de(ligne) > 0]

    def enregistrer(  # noqa: PLR0913
        self,
        ligne_id: int,
        *,
        montant: int,
        mode: str,
        reference: str,
        depense: int,
        auteur: int,
        le: datetime,
    ) -> int:
        return PaiementSalaire.objects.create(
            ligne_id=ligne_id,
            montant=montant,
            mode=mode,
            reference=reference,
            depense_id=depense,
            paye_par_id=auteur,
            paye_le=le,
        ).pk

    def marquer(self, etat_id: int, statut: StatutPaie) -> None:
        EtatPaie.objects.filter(pk=etat_id).update(statut=statut)


class DepensesDjango:
    def salaire_paye(
        self,
        ligne: EtatLigne,
        *,
        montant: int,
        mode: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> int:
        """Sans seuil de validation : le propriétaire a validé l'état de paie."""
        etat = cas_depenses.saisir(
            depots_depenses,
            depense=NouvelleDepense(
                categorie=Categorie.SALAIRES,
                libelle=f"Salaire {ligne.mois:%m/%Y} · {ligne.employe}",
                montant=montant,
                paye_par=PAYE_PAR[mode],
                rattachement=Rattachement.SEMAINE,
            ),
            session_production=session_de_production(maintenant, limites()),
            justificatif=None,
            auteur=auteur,
            maintenant=maintenant,
        )
        return etat.id


def pdf_bulletin(ligne: LignePaie) -> bytes:
    from weasyprint import HTML  # noqa: PLC0415 : bibliothèque lourde, chargée au besoin

    html = render_to_string(
        "paie/bulletin.html",
        {
            "ligne": ligne,
            "calcul": calcul_de(ligne),
            "paiements": ligne.paiements.all(),
            "paye": deja_paye(ligne),
            "reste": reste_de(ligne),
            "edite_le": timezone.localdate(),
        },
    )
    return HTML(string=html).write_pdf()


depots = Depots(
    paiements=DepotPaiementsDjango(),
    depenses=DepensesDjango(),
    journal=journal,
)
