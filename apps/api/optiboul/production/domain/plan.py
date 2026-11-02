"""Plan de production d'une session (CdC §5.5, R4). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from datetime import time
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


class MotifSupplement(StrEnum):
    """Pourquoi le chef ajoute des sacs (CdC §5.5)."""

    HABITUELS = "habituels"
    GUICHET = "guichet"
    MARCHE = "marche"  # marché ou événement
    TARDIVE = "tardive"  # commande tardive


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


def est_avant(session: Session, autre: Session) -> bool:
    """Le jour passe avant la nuit d'une même date."""
    return (session.jour, session.creneau != JOUR) < (autre.jour, autre.creneau != JOUR)


@dataclass(frozen=True)
class Rendement:
    """Ce que le plan retient de la fiche technique en cours (CdC §5.5)."""

    fiche: int  # identifiant de la version : le plan la garde
    version: int
    pains_par_sac: int
    pains_par_boule: int


@dataclass(frozen=True)
class Demande:
    """Les trois sources du plan, en pains (CdC §5.5)."""

    commandes: int = 0
    habituels: int = 0  # clients habituels sans commande
    guichet: int = 0  # ventes au guichet, moyenne des dernières sessions

    @property
    def estimee(self) -> int:
        return self.commandes + self.habituels + self.guichet


@dataclass(frozen=True)
class LignePlan:
    code: str
    rendement: Rendement
    demande: Demande
    base: int  # sacs pour les commandes
    supplement: int  # sacs ajoutés par le chef de production
    sacs: int
    prevus: int  # pains prévus : sacs fois pains par sac
    boules: int
    moyenne_sacs: Decimal | None  # dernières sessions du même type

    @property
    def commandes(self) -> int:
        return self.demande.commandes

    @property
    def besoin(self) -> int:
        """Sacs qui manquent pour couvrir la demande estimée."""
        necessaires = sacs_pour(self.demande.estimee, self.rendement.pains_par_sac)
        return max(0, necessaires - self.sacs)

    @property
    def au_dessus_du_plan(self) -> bool:
        return self.demande.estimee > self.prevus


AVANCE_VALIDATION_AUTO = timedelta(minutes=15)


def heure_validation_auto(session: Session, petrissage: time) -> datetime:
    """T-15 min avant le pétrissage de la session (O6)."""
    return datetime.combine(session.jour, petrissage, tzinfo=FUSEAU) - (
        AVANCE_VALIDATION_AUTO
    )


def dans_la_tolerance(sacs: int, moyenne: Decimal | None, tolerance: int) -> bool:
    """± tolérance % de la moyenne des dernières sessions du même type (R4)."""
    if moyenne is None or moyenne <= 0:
        return False
    return abs(Decimal(sacs) - moyenne) <= moyenne * tolerance / 100


def decision_automatique(
    sacs: int,
    moyenne: Decimal | None,
    tolerance: int,
) -> StatutPlan:
    """Sans réponse du gérant : validé dans la tolérance, sinon provisoire (O6)."""
    if dans_la_tolerance(sacs, moyenne, tolerance):
        return StatutPlan.VALIDE
    return StatutPlan.PROVISOIRE


class StatutSupplement(StrEnum):
    AUTO_ACCORDE = "auto_accorde"  # supplément faible, accordé sans attendre (O17)
    DEMANDE = "demande"  # au-delà du seuil : accord du gérant (R15)
    ACCORDE = "accorde"
    REFUSE = "refuse"


def supplement_faible(  # noqa: PLR0913
    supplement: dict[str, int],
    *,
    sacs_du_plan: int,
    farine_necessaire: Decimal,
    farine_en_stock: Decimal,
    seuil_sacs: int,
    seuil_pourcentage: int,
) -> bool:
    """O17 : au plus 1 sac par produit et 10 % du plan (paramètres), farine
    suffisante ; sinon le gérant décide (R15)."""
    total = sum(supplement.values())
    return (
        total > 0
        and all(sacs <= seuil_sacs for sacs in supplement.values())
        and total * 100 <= sacs_du_plan * seuil_pourcentage
        and farine_necessaire <= farine_en_stock
    )


def sacs_pour(pains: int, pains_par_sac: int) -> int:
    return ceil(pains / pains_par_sac) if pains > 0 else 0


def ligne(
    code: str,
    rendement: Rendement,
    demande: Demande,
    moyenne_sacs: Decimal | None,
    supplement: int = 0,
) -> LignePlan:
    """Sacs des commandes arrondis au sac supérieur, plus le supplément du chef ;
    pains prévus et boules à façonner."""
    base = sacs_pour(demande.commandes, rendement.pains_par_sac)
    sacs = base + supplement
    prevus = sacs * rendement.pains_par_sac
    return LignePlan(
        code=code,
        rendement=rendement,
        demande=demande,
        base=base,
        supplement=supplement,
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
