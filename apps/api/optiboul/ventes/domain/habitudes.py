"""Clients habituels et commande habituelle (CdC §5.3, O3, O18). Python pur."""

from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from decimal import ROUND_HALF_UP
from decimal import Decimal
from math import ceil

from .commandes import Limites
from .commandes import Session
from .commandes import heure_limite


def sessions_precedentes(session: Session, nombre: int) -> list[Session]:
    """Les N dernières sessions du même type (jour ou nuit), la plus récente d'abord."""
    return [
        Session(session.jour - timedelta(days=rang), session.creneau)
        for rang in range(1, nombre + 1)
    ]


def est_habituel(commandes: int, nombre: int) -> bool:
    """Habituel : il a commandé au moins une session sur deux parmi les N dernières."""
    return commandes > 0 and commandes >= ceil(nombre / 2)


def commande_habituelle(historique: list[dict[str, int]]) -> dict[str, int]:
    """Moyenne par produit des sessions où le client a commandé, arrondie au pain."""
    if not historique:
        return {}
    totaux: dict[str, int] = {}
    for lignes in historique:
        for code, quantite in lignes.items():
            totaux[code] = totaux.get(code, 0) + quantite
    moyennes = {
        code: int(
            (Decimal(total) / len(historique)).quantize(Decimal(1), ROUND_HALF_UP),
        )
        for code, total in totaux.items()
    }
    return {code: quantite for code, quantite in moyennes.items() if quantite}


def heure_du_rappel(
    session: Session,
    limites: Limites,
    avance_minutes: int,
) -> datetime:
    """Rappel automatique 30 minutes (paramètre) avant l'heure limite (O18)."""
    return heure_limite(session, limites) - timedelta(minutes=avance_minutes)


def rappel_du(
    maintenant: datetime,
    session: Session,
    limites: Limites,
    avance_minutes: int,
) -> bool:
    """Entre l'heure du rappel et l'heure limite de la session."""
    return (
        heure_du_rappel(session, limites, avance_minutes)
        <= maintenant
        < heure_limite(session, limites)
    )
