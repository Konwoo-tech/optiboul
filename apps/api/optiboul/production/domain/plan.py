"""Plan de production d'une session (CdC §5.5, R4). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from datetime import timedelta
from decimal import ROUND_HALF_UP
from decimal import Decimal
from enum import StrEnum
from math import ceil

from optiboul.ventes.domain.commandes import FUSEAU
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Limites
from optiboul.ventes.domain.commandes import Session

from .fiches import boules


class StatutPlan(StrEnum):
    PROPOSE = "propose"
    VALIDE = "valide"
    PROVISOIRE = "provisoire"  # sans validation à T-15 min, hors tolérance (O6)


VALIDES = frozenset({StatutPlan.VALIDE, StatutPlan.PROVISOIRE})


def session_de_production(maintenant: datetime, limites: Limites) -> Session:
    """La session dont l'heure limite des commandes vient de passer : son plan se
    prépare, puis sa production tourne jusqu'à la session suivante."""
    local = maintenant.astimezone(FUSEAU)
    if local.time() >= limites.nuit:
        return Session(local.date(), NUIT)
    if local.time() >= limites.jour:
        return Session(local.date(), JOUR)
    return Session(local.date() - timedelta(days=1), NUIT)


@dataclass(frozen=True)
class Rendement:
    """Ce que le plan retient de la fiche technique en cours (CdC §5.5)."""

    fiche: int  # identifiant de la version : le plan la garde
    version: int
    pains_par_sac: int
    pains_par_boule: int


@dataclass(frozen=True)
class LignePlan:
    code: str
    rendement: Rendement
    commandes: int  # pains commandés
    sacs: int
    prevus: int  # pains prévus : sacs fois pains par sac
    boules: int
    moyenne_sacs: Decimal | None  # dernières sessions du même type


def sacs_pour(pains: int, pains_par_sac: int) -> int:
    return ceil(pains / pains_par_sac) if pains > 0 else 0


def ligne(
    code: str,
    rendement: Rendement,
    commandes: int,
    moyenne_sacs: Decimal | None,
) -> LignePlan:
    """Sacs arrondis au sac supérieur, pains prévus et boules à façonner."""
    sacs = sacs_pour(commandes, rendement.pains_par_sac)
    prevus = sacs * rendement.pains_par_sac
    return LignePlan(
        code=code,
        rendement=rendement,
        commandes=commandes,
        sacs=sacs,
        prevus=prevus,
        boules=boules(prevus, rendement.pains_par_boule),
        moyenne_sacs=moyenne_sacs,
    )


def moyenne(valeurs: list[int]) -> Decimal | None:
    """Moyenne à une décimale ; None sans historique."""
    if not valeurs:
        return None
    return (Decimal(sum(valeurs)) / len(valeurs)).quantize(
        Decimal("0.1"),
        ROUND_HALF_UP,
    )


def moyennes_par_produit(historique: list[dict[str, int]]) -> dict[str, Decimal]:
    """Sacs moyens de chaque produit sur les sessions passées (absent : 0 sac)."""
    codes = {code for plan in historique for code in plan}
    resultat = {}
    for code in codes:
        valeur = moyenne([plan.get(code, 0) for plan in historique])
        if valeur is not None:
            resultat[code] = valeur
    return resultat
