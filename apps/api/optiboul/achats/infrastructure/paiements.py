"""Paiements fournisseurs en base, dépense et reçu PDF (US-103)."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db.models import Sum
from django.template.loader import render_to_string
from django.utils import timezone

from optiboul.achats.application.paiements import Depots
from optiboul.achats.application.paiements import EtatFacture
from optiboul.core.infrastructure.journal import journal
from optiboul.depenses.application import depenses as cas_depenses
from optiboul.depenses.domain.depenses import Categorie
from optiboul.depenses.domain.depenses import NouvelleDepense
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.infrastructure.depenses import depots as depots_depenses
from optiboul.production.domain.plan import session_de_production
from optiboul.ventes.infrastructure.commandes import limites

from .models import FactureFournisseur
from .models import PaiementFournisseur
from .models import Reception

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.achats.domain.receptions import StatutFacture
    from optiboul.core.application.journal import Auteur

PAYE_PAR = {
    "especes": PayePar.CAISSE,
    "banque": PayePar.BANQUE,
    "mobile": PayePar.MOBILE,
}


class DepotFacturesDjango:
    def verrouiller(self, facture_id: int) -> EtatFacture | None:
        facture = (
            FactureFournisseur.objects.select_for_update(of=("self",))
            .select_related("fournisseur")
            .filter(pk=facture_id)
            .first()
        )
        if facture is None:
            return None
        receptions = Reception.objects.filter(facture=facture).select_related(
            "planifiee__matiere",
        )
        premiere = receptions.first()
        return EtatFacture(
            id=facture.pk,
            numero=facture.numero,
            fournisseur=facture.fournisseur.nom,
            montant=facture.montant,
            paye=facture.paiements.aggregate(total=Sum("montant"))["total"] or 0,
            matiere=premiere.planifiee.matiere.code if premiere else "",
            quantite=sum((r.quantite for r in receptions), Decimal(0)),
        )

    def payer(  # noqa: PLR0913
        self,
        facture_id: int,
        *,
        montant: int,
        mode: str,
        reference: str,
        depense: int,
        statut: StatutFacture,
        auteur: int,
        le: datetime,
    ) -> int:
        FactureFournisseur.objects.filter(pk=facture_id).update(statut=statut)
        return PaiementFournisseur.objects.create(
            facture_id=facture_id,
            montant=montant,
            mode=mode,
            reference=reference,
            depense_id=depense,
            paye_par_id=auteur,
            paye_le=le,
        ).pk


class DepensesDjango:
    def facture_payee(
        self,
        facture: EtatFacture,
        *,
        montant: int,
        mode: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> int:
        """La dépense passe sans seuil de validation : la facture vient d'une
        réception planifiée et comptée (US-101)."""
        depense = NouvelleDepense(
            categorie=Categorie.MATIERES,
            libelle=f"Facture n° {facture.numero} · {facture.fournisseur}",
            montant=montant,
            paye_par=PAYE_PAR[mode],
            rattachement=Rattachement.STOCK,
            matiere=facture.matiere,
            quantite=facture.quantite or None,
            fournisseur=facture.fournisseur,
        )
        etat = cas_depenses.saisir(
            depots_depenses,
            depense=depense,
            session_production=session_de_production(maintenant, limites()),
            justificatif=None,
            auteur=auteur,
            maintenant=maintenant,
            entree_en_stock=False,
        )
        return etat.id


def html_recu(paiement: PaiementFournisseur) -> str:
    facture = paiement.facture
    deja = (
        facture.paiements.filter(paye_le__lte=paiement.paye_le).aggregate(
            total=Sum("montant"),
        )["total"]
        or 0
    )
    return render_to_string(
        "achats/recu.html",
        {
            "paiement": paiement,
            "facture": facture,
            "moment": timezone.localtime(paiement.paye_le),
            "reste": facture.montant - deja,
        },
    )


def pdf_recu(paiement: PaiementFournisseur) -> bytes:
    from weasyprint import HTML  # noqa: PLC0415 : bibliothèque lourde, chargée au besoin

    return HTML(string=html_recu(paiement)).write_pdf()


depots = Depots(
    factures=DepotFacturesDjango(),
    depenses=DepensesDjango(),
    journal=journal,
)
