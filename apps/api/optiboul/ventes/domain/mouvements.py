"""Mouvements internes (CdC §5.3) : guichet, retours, reste en salle, ration."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from optiboul.core.domain.erreurs import RefusMetier


class GenreMouvementInterne(StrEnum):
    VENTE_GUICHET = "vente_guichet"
    RETOURS = "retours"
    RESTE_EN_SALLE = "reste_en_salle"
    RATION = "ration"


@dataclass(frozen=True)
class MouvementInterne:
    genre: GenreMouvementInterne
    produit: str
    quantite: int
    motif: str


def verifier_mouvement(mouvement: MouvementInterne) -> MouvementInterne:
    """Des pains, et toujours un motif (CdC §5.3)."""
    if mouvement.quantite <= 0:
        message = "La quantité de pains est positive."
        raise RefusMetier("quantite_invalide", message)
    motif = mouvement.motif.strip()
    if not motif:
        message = "Le motif du mouvement est obligatoire."
        raise RefusMetier("motif_obligatoire", message)
    return MouvementInterne(
        mouvement.genre,
        mouvement.produit,
        mouvement.quantite,
        motif,
    )


def totaux(
    mouvements: list[tuple[GenreMouvementInterne, str, int]],
) -> dict[GenreMouvementInterne, dict[str, int]]:
    """Pains par genre puis par produit, pour les totaux justes de la session."""
    resultat: dict[GenreMouvementInterne, dict[str, int]] = {
        genre: {} for genre in GenreMouvementInterne
    }
    for genre, produit, quantite in mouvements:
        resultat[genre][produit] = resultat[genre].get(produit, 0) + quantite
    return resultat
