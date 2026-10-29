"""Comptes clients : registre de mouvements en ajout seul (R21, ADR-04)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

if TYPE_CHECKING:
    from optiboul.clients.domain.clients import Sens


@dataclass(frozen=True)
class Compte:
    client: int
    nom: str
    actif: bool
    plafond: int  # plafond effectif : propre au client, sinon général (R6)
    solde: int  # négatif : dette


class Comptes(Protocol):
    def verrouiller(self, client_id: int) -> Compte | None:
        """Relit le compte en le verrouillant jusqu'à la fin de la transaction."""
        ...

    def prix(self, client_id: int) -> dict[str, int | None]:
        """Prix appliqués au client : code du produit → FCFA l'unité."""
        ...

    def mouvement(  # noqa: PLR0913
        self,
        client_id: int,
        *,
        semaine: int,
        sens: Sens,
        montant: int,
        source_type: str,
        source_id: int,
        auteur: int,
    ) -> None: ...
