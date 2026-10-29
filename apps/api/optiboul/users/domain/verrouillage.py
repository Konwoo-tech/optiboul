"""Verrouillage après échecs (CdC §4.2, R14). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from datetime import timedelta

ECHECS_MAX = 5
DUREE_BLOCAGE = timedelta(minutes=15)


@dataclass(frozen=True)
class EtatVerrou:
    echecs: int
    bloque_jusqua: datetime | None

    def bloque(self, maintenant: datetime) -> bool:
        return self.bloque_jusqua is not None and maintenant < self.bloque_jusqua


def apres_echec(etat: EtatVerrou, maintenant: datetime) -> EtatVerrou:
    """5 échecs de suite bloquent le compte 15 minutes ; le compteur repart ensuite."""
    if etat.bloque(maintenant):
        return etat
    echecs = etat.echecs + 1
    if echecs >= ECHECS_MAX:
        return EtatVerrou(echecs=0, bloque_jusqua=maintenant + DUREE_BLOCAGE)
    return EtatVerrou(echecs=echecs, bloque_jusqua=None)


def apres_reussite() -> EtatVerrou:
    return EtatVerrou(echecs=0, bloque_jusqua=None)


def essais_par_jour_au_plus() -> int:
    """Rythme maximal d'un attaquant sur un compte : 5 codes toutes les 15 minutes."""
    return ECHECS_MAX * int(timedelta(days=1) / DUREE_BLOCAGE)
