"""Livraisons (CdC §5.3, R6, R21) : montant dû selon le tarif du client. Python pur."""

from __future__ import annotations

from dataclasses import dataclass

from optiboul.core.domain.erreurs import RefusMetier


@dataclass(frozen=True)
class Ligne:
    code: str
    quantite: int
    prix_unitaire: int

    @property
    def montant(self) -> int:
        return self.quantite * self.prix_unitaire


def lignes_facturees(
    quantites: dict[str, int],
    prix: dict[str, int | None],
) -> list[Ligne]:
    """Chaque pain livré au prix du client ; un produit sans prix ne se livre pas."""
    if sans_prix := sorted(code for code in quantites if prix.get(code) is None):
        message = f"Aucun prix pour : {', '.join(sans_prix)}."
        raise RefusMetier("prix_inconnu", message, produits=sans_prix)
    return [
        Ligne(code, quantite, prix[code] or 0) for code, quantite in quantites.items()
    ]


def montant_du(lignes: list[Ligne]) -> int:
    return sum(ligne.montant for ligne in lignes)
