"""Double authentification (CdC §4.1, O1, R14). Python pur."""

from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo("Africa/Douala")
PROFILS_SENSIBLES = frozenset({"gerant", "proprietaire", "administrateur"})

LONGUEUR_CODE = 6
VALIDITE_CODE = timedelta(minutes=5)
ESSAIS_CODE = 3
DELAI_RENVOI = timedelta(seconds=30)
VALIDITE_IDENTIFICATION = timedelta(minutes=10)


def double_auth_requise(
    *,
    via: str,
    profil: str | None,
    distante: bool,
    derniere: datetime | None,
    maintenant: datetime,
) -> bool:
    """Au comptoir par code : seulement les rôles sensibles, une fois par jour.

    E-mail, Google ou accès distant : à chaque connexion.
    """
    if distante or via != "code":
        return True
    if profil not in PROFILS_SENSIBLES:
        return False
    if derniere is None:
        return True
    return derniere.astimezone(FUSEAU).date() != maintenant.astimezone(FUSEAU).date()


def renvoi_dans(dernier_envoi: datetime | None, maintenant: datetime) -> int:
    """Secondes avant de pouvoir renvoyer un code sur le même canal (0 : possible)."""
    if dernier_envoi is None:
        return 0
    reste = DELAI_RENVOI - (maintenant - dernier_envoi)
    return max(0, int(reste.total_seconds() + 0.999))
