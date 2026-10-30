"""Fiches techniques (CdC §5.5) : rendement et recette d'un sac de 50 kg. Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP
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


@dataclass(frozen=True)
class CoutDeRevient:
    """En entiers FCFA, depuis les prix des matières (US-089)."""

    par_sac: int
    par_pain: int
    marge_par_pain: int | None  # sans prix de vente, pas de marge
    sans_prix: list[str]  # matières de la recette sans prix connu : coût minoré


def cout_de_revient(
    recette: dict[str, Decimal],
    prix: dict[str, Decimal],
    *,
    pains_par_sac: int,
    prix_de_vente: int | None,
) -> CoutDeRevient:
    total = sum(
        (quantite * prix[code] for code, quantite in recette.items() if code in prix),
        Decimal(0),
    )
    par_pain = int((total / pains_par_sac).quantize(Decimal(1), ROUND_HALF_UP))
    return CoutDeRevient(
        par_sac=int(total.quantize(Decimal(1), ROUND_HALF_UP)),
        par_pain=par_pain,
        marge_par_pain=None if prix_de_vente is None else prix_de_vente - par_pain,
        sans_prix=sorted(code for code in recette if code not in prix),
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
