"""Ce que les factures fournisseurs apportent à la clôture de la semaine (#344)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_controle

from .models import FactureFournisseur

if TYPE_CHECKING:
    from optiboul.core.application.semaines import EtatSemaine


def numero_affiche(numero: int) -> str:
    """FAC-41, comme à l'écran Fournisseurs."""
    return f"FAC-{numero}"


def factures_en_retard(semaine: EtatSemaine) -> Controle:
    """À voir (CdC §5.1) : factures non payées dont l'échéance est passée."""
    factures = list(
        FactureFournisseur.objects.exclude(statut="payee")
        .filter(echeance__lt=timezone.localdate())
        .select_related("fournisseur")
        .order_by("echeance", "numero"),
    )
    if not factures:
        return Controle("factures_en_retard", Niveau.OK, "", {"factures": []})
    total = sum(f.montant for f in factures)
    return Controle(
        "factures_en_retard",
        Niveau.SURVEILLER,
        f"{len(factures)} facture(s) fournisseur en retard, {total} FCFA.",
        {
            "factures": [
                {
                    "id": f.pk,
                    "numero": numero_affiche(f.numero),
                    "libelle": f.fournisseur.nom,
                    "montant": f.montant,
                    "echeance": f.echeance.isoformat(),
                }
                for f in factures
            ],
        },
    )


def enregistrer() -> None:
    enregistrer_controle("factures_en_retard", factures_en_retard)
