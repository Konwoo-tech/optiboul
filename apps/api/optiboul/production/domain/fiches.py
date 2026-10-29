"""Fiches techniques (CdC §5.5) : rendement et recette d'un sac de 50 kg. Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from math import ceil

from optiboul.core.domain.erreurs import RefusMetier

POIDS_SAC_KG = 50


@dataclass(frozen=True)
class Fiche:
    """Une version de fiche : le plan d'une session garde celle qu'il a utilisée."""

    poids_boule: int  # grammes de pâte par boule
    pains_par_boule: int
    pains_par_sac: int
    procede: str
    # Code de la matière → quantité pour un sac, dans l'unité de la matière.
    recette: dict[str, Decimal]

    def meme_contenu(self, autre: Fiche) -> bool:
        return (
            self.poids_boule == autre.poids_boule
            and self.pains_par_boule == autre.pains_par_boule
            and self.pains_par_sac == autre.pains_par_sac
            and self.procede.strip() == autre.procede.strip()
            and _sans_zero(self.recette) == _sans_zero(autre.recette)
        )


def _sans_zero(recette: dict[str, Decimal]) -> dict[str, Decimal]:
    return {code: quantite for code, quantite in recette.items() if quantite}


def verifier_fiche(fiche: Fiche, matieres_connues: set[str]) -> None:
    """Rendement en entiers positifs ; recette de matières connues, sans négatif."""
    champs = [
        champ
        for champ in ("poids_boule", "pains_par_boule", "pains_par_sac")
        if getattr(fiche, champ) <= 0
    ]
    if champs:
        message = "Poids de boule, pains par boule et pains par sac sont positifs."
        raise RefusMetier("fiche_invalide", message, champs=champs)
    if fiche.pains_par_boule > fiche.pains_par_sac:
        message = "Un sac donne au moins une boule : pains par sac ≥ pains par boule."
        raise RefusMetier("fiche_invalide", message, champs=["pains_par_sac"])
    inconnues = sorted(set(fiche.recette) - matieres_connues)
    if inconnues:
        message = f"Matières inconnues : {', '.join(inconnues)}."
        raise RefusMetier("fiche_invalide", message, champs=["recette"])
    if any(quantite < 0 for quantite in fiche.recette.values()):
        message = "Les quantités de la recette ne sont pas négatives."
        raise RefusMetier("fiche_invalide", message, champs=["recette"])
    if not fiche.recette.get("farine"):
        message = "La recette d'un sac contient de la farine."
        raise RefusMetier("fiche_invalide", message, champs=["recette"])


def boules(pains: int, pains_par_boule: int) -> int:
    """Boules à façonner pour ces pains, arrondies à la boule supérieure."""
    return ceil(pains / pains_par_boule) if pains > 0 else 0


def boules_par_sac(fiche: Fiche) -> Decimal:
    return (Decimal(fiche.pains_par_sac) / fiche.pains_par_boule).quantize(
        Decimal("0.01"),
    )
