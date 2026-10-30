"""Production d'une session : ouverte, réalisé par fournée, clôturée (CdC §5.5, R5).

Python pur.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum


class StatutProduction(StrEnum):
    EN_COURS = "en_cours"
    CLOTUREE = "cloturee"
    NON_CLOTUREE = "non_cloturee"  # archivée : session dépassée ou clôture forcée


RAISONS_CLOTURE = {
    "realise_manquant": "Saisissez le réalisé de chaque produit du plan (R5).",
    "consommation_manquante": "Saisissez la consommation de chaque matière (R5).",
}


def raisons_de_ne_pas_cloturer(
    *,
    planifies: set[str],
    realise: dict[str, int],
    matieres: set[str],
    consommation: dict[str, Decimal],
) -> dict[str, list[str]]:
    """R5 : pas de clôture sans le réalisé de chaque produit planifié ni la
    consommation de chaque matière de leurs recettes."""
    raisons = {}
    if manquants := sorted(code for code in planifies if code not in realise):
        raisons["realise_manquant"] = manquants
    if manquantes := sorted(m for m in matieres if m not in consommation):
        raisons["consommation_manquante"] = manquantes
    return raisons


def reste_a_produire(prevus: dict[str, int], realise: dict[str, int]) -> dict[str, int]:
    """Prévu moins réalisé par produit, jamais négatif (CdC §5.5)."""
    return {
        code: max(0, pains - realise.get(code, 0)) for code, pains in prevus.items()
    }


def ecarts_a_justifier(  # noqa: PLR0913
    *,
    theorique: dict[str, Decimal],
    reelle: dict[str, Decimal],
    unites: dict[str, str],
    sacs: int,
    kg_par_sac: int,
    pourcent: int,
) -> list[str]:
    """R10 : au-delà de 2 kg par sac, ou de 4 % pour les intrants en grammes."""
    depasses = []
    for matiere, attendue in theorique.items():
        if matiere not in reelle:
            continue
        ecart = abs(reelle[matiere] - attendue)
        tolere = (
            Decimal(kg_par_sac * sacs)
            if unites.get(matiere) == "kg"
            else attendue * pourcent / 100
        )
        if ecart > tolere:
            depasses.append(matiere)
    return sorted(depasses)


def consommation_theorique(
    sacs: dict[str, int],
    recettes: dict[str, dict[str, Decimal]],
) -> dict[str, Decimal]:
    """Recette d'un sac fois les sacs de chaque produit, par matière."""
    totaux: dict[str, Decimal] = {}
    for code, nombre in sacs.items():
        for matiere, quantite in recettes.get(code, {}).items():
            totaux[matiere] = totaux.get(matiere, Decimal(0)) + quantite * nombre
    return totaux
