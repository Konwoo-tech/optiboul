"""Montant payé et reste dû des factures fournisseurs (#351, #369), sans requête
par facture."""

from __future__ import annotations

from typing import Any

from django.db.models import IntegerField
from django.db.models import OuterRef
from django.db.models import Subquery
from django.db.models import Sum
from django.db.models.functions import Coalesce

from .models import FactureFournisseur
from .models import PaiementFournisseur

PAYE = Coalesce(
    Subquery(
        PaiementFournisseur.objects.filter(facture=OuterRef("pk"))
        .order_by()
        .values("facture")
        .annotate(total=Sum("montant"))
        .values("total"),
        output_field=IntegerField(),
    ),
    0,
)


def numero_affiche(numero: int) -> str:
    """FAC-41, comme à l'écran Fournisseurs."""
    return f"FAC-{numero}"


def non_soldees() -> list[dict[str, Any]]:
    """Factures avec un reste dû, la plus ancienne échéance d'abord."""
    factures = (
        FactureFournisseur.objects.exclude(statut="payee")
        .annotate(paye=PAYE)
        .select_related("fournisseur")
        .order_by("echeance", "numero")
    )
    return [
        {
            "facture": numero_affiche(f.numero),
            "fournisseur": f.fournisseur.nom,
            "echeance": f.echeance,
            "montant": f.montant,
            "reste": f.montant - f.paye,
        }
        for f in factures
        if f.montant - f.paye > 0
    ]
