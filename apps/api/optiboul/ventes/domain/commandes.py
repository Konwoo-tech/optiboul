"""Commandes par session (CdC §5.3, O3) : session visée, heure limite, sacs à pétrir.

Python pur. Une session est un jour et un créneau : le jour de 06:00 à 18:00, la nuit
de 18:00 au lendemain 06:00. On commande pour la nuit jusqu'à 18:30 (paramètre) et
pour le jour jusqu'à 05:30 le matin même.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import datetime
from datetime import time
from datetime import timedelta
from math import ceil
from zoneinfo import ZoneInfo

from optiboul.core.domain.erreurs import RefusMetier

FUSEAU = ZoneInfo("Africa/Douala")
JOUR, NUIT = "jour", "nuit"


@dataclass(frozen=True)
class Limites:
    """Heures limites des commandes (paramètres, CdC §9)."""

    jour: time  # 05:30 : commandes de la session de jour
    nuit: time  # 18:30 : commandes de la session de nuit

    @classmethod
    def depuis(cls, jour: str, nuit: str) -> Limites:
        return cls(time.fromisoformat(jour), time.fromisoformat(nuit))


@dataclass(frozen=True)
class Session:
    jour: date
    creneau: str

    def veille(self) -> Session:
        return Session(self.jour - timedelta(days=1), self.creneau)


def heure_limite(session: Session, limites: Limites) -> datetime:
    heure = limites.jour if session.creneau == JOUR else limites.nuit
    return datetime.combine(session.jour, heure, tzinfo=FUSEAU)


def session_visee(maintenant: datetime, limites: Limites) -> Session:
    """La prochaine session dont l'heure limite n'est pas passée."""
    local = maintenant.astimezone(FUSEAU)
    if local.time() < limites.jour:
        return Session(local.date(), JOUR)
    if local.time() < limites.nuit:
        return Session(local.date(), NUIT)
    return Session(local.date() + timedelta(days=1), JOUR)


def quantites_saisies(lignes: dict[str, int]) -> dict[str, int]:
    """Quantités en pains, entières et positives ; les zéros sont retirés."""
    if any(quantite < 0 for quantite in lignes.values()):
        message = "Les quantités commandées ne sont pas négatives."
        raise RefusMetier("quantite_invalide", message)
    saisies = {code: quantite for code, quantite in lignes.items() if quantite}
    if not saisies:
        message = "La commande ne contient aucun pain."
        raise RefusMetier("commande_vide", message)
    return saisies


def pains_ajoutes(
    avant: dict[str, int] | None,
    apres: dict[str, int],
) -> dict[str, int]:
    """Ce qu'une saisie ajoute par produit : tout, pour une nouvelle commande."""
    avant = avant or {}
    return {
        code: quantite - avant.get(code, 0)
        for code, quantite in apres.items()
        if quantite > avant.get(code, 0)
    }


def sacs_a_petrir(pains: int, pains_par_sac: int) -> int:
    """Sacs nécessaires aux pains commandés, arrondis au sac supérieur (CdC §5.3)."""
    return ceil(pains / pains_par_sac) if pains > 0 else 0
