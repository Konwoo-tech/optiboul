"""Port du stock utilisé par les autres applications (production, achats, dépenses)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Protocol

if TYPE_CHECKING:
    from decimal import Decimal

    from optiboul.stocks.domain.stocks import GenreMouvementStock
    from optiboul.stocks.domain.stocks import Sens


class Stock(Protocol):
    def suivies(self) -> set[str]:
        """Codes des matières suivies en stock."""
        ...

    def quantites(self) -> dict[str, Decimal]:
        """Stock actuel de chaque matière, dans l'unité de la matière."""
        ...

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
        """Écrit un mouvement par matière dans le registre ; renvoie leur nombre."""
        ...
