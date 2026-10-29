"""File d'envoi (O15, R22). Python pur : canaux, délais entre deux tentatives."""

from __future__ import annotations

from datetime import timedelta
from enum import StrEnum


class Canal(StrEnum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


class StatutEnvoi(StrEnum):
    EN_ATTENTE = "en_attente"
    ENVOYE = "envoye"
    ECHEC = "echec"


# Au-delà, le message passe en échec et reste visible (O15 : état visible).
TENTATIVES_MAX = 10
_DELAI_MAX = timedelta(hours=1)


def delai_avant_nouvel_essai(tentatives: int) -> timedelta:
    """Délai croissant après un échec : 30 s, 1 min, 2 min… plafonné à une heure."""
    delai = timedelta(seconds=30) * (2 ** max(0, tentatives - 1))
    return min(delai, _DELAI_MAX)


def statut_apres_echec(tentatives: int) -> StatutEnvoi:
    return StatutEnvoi.ECHEC if tentatives >= TENTATIVES_MAX else StatutEnvoi.EN_ATTENTE


def masquer_telephone(telephone: str) -> str:
    """« 677412018 » → « +237 6 •• •• 20 18 » : jamais le numéro en entier."""
    chiffres = "".join(c for c in telephone if c.isdigit())
    chiffres = chiffres.removeprefix("237") if len(chiffres) > 9 else chiffres  # noqa: PLR2004
    if len(chiffres) < 5:  # noqa: PLR2004
        return "•• •• ••"
    fin = chiffres[-4:]
    return f"+237 {chiffres[0]} •• •• {fin[:2]} {fin[2:]}"
