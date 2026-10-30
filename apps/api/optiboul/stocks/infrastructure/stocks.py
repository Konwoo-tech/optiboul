"""Stock en base (adaptateur du port `Stock`) : somme du registre des mouvements."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db.models import F
from django.db.models import Sum

from .models import Matiere
from .models import MouvementStock

if TYPE_CHECKING:
    from optiboul.stocks.domain.stocks import GenreMouvementStock
    from optiboul.stocks.domain.stocks import Sens


class StockDjango:
    def suivies(self) -> set[str]:
        return set(Matiere.objects.filter(stockee=True).values_list("code", flat=True))

    def quantites(self) -> dict[str, Decimal]:
        sommes = dict(
            MouvementStock.objects.values_list("matiere__code")
            .annotate(total=Sum(F("sens") * F("quantite")))
            .values_list("matiere__code", "total"),
        )
        return {
            code: Decimal(sommes.get(code) or 0)
            for code in Matiere.objects.filter(stockee=True).values_list(
                "code",
                flat=True,
            )
        }

    def mouvementer(  # noqa: PLR0913
        self,
        quantites: dict[str, Decimal],
        *,
        sens: Sens,
        genre: GenreMouvementStock,
        source_type: str,
        source_id: int,
        semaine: int,
        auteur: int,
        motif: str = "",
    ) -> int:
        matieres = dict(Matiere.objects.values_list("code", "pk"))
        lignes = [
            MouvementStock(
                matiere_id=matieres[code],
                sens=sens,
                quantite=quantite,
                genre=genre,
                source_type=source_type,
                source_id=source_id,
                semaine_id=semaine,
                auteur_id=auteur,
                motif=motif,
            )
            for code, quantite in quantites.items()
            if quantite > 0
        ]
        MouvementStock.objects.bulk_create(lignes)
        return len(lignes)


stock = StockDjango()
