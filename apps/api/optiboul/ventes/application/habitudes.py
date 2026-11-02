"""Clients habituels sans commande (US-057, CdC §5.3, O3, O18)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.domain.habitudes import commande_habituelle
from optiboul.ventes.domain.habitudes import est_habituel
from optiboul.ventes.domain.habitudes import sessions_precedentes

from . import commandes as cas_commandes

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.ventes.domain.commandes import Limites
    from optiboul.ventes.domain.commandes import Session

    from .commandes import Depots
    from .commandes import EtatCommande


@dataclass(frozen=True)
class Habituel:
    client: int
    commande: dict[str, int]  # moyenne des sessions où il a commandé
    sessions: int  # sessions commandées parmi les N dernières du même type


class Historique(Protocol):
    def commandes(self, sessions: list[Session]) -> dict[int, list[dict[str, int]]]:
        """Client actif → lignes de ses commandes sur ces sessions."""
        ...


def habituels(
    depots: Depots,
    historique: Historique,
    *,
    session: Session,
    nombre: int,
) -> list[Habituel]:
    """Clients qui commandent d'habitude à ce type de session et n'ont pas commandé."""
    deja = {c.client for c in depots.commandes.de_la_session(session)}
    resultat = []
    passees = historique.commandes(sessions_precedentes(session, nombre))
    for client, lignes in passees.items():
        if client in deja or not est_habituel(len(lignes), nombre):
            continue
        if commande := commande_habituelle(lignes):
            resultat.append(Habituel(client, commande, len(lignes)))
    return resultat


def reprendre_habituelle(  # noqa: PLR0913
    depots: Depots,
    historique: Historique,
    *,
    client_id: int,
    session: Session,
    nombre: int,
    auteur: Auteur,
    maintenant: datetime,
    limites: Limites,
) -> EtatCommande:
    """Le client confirme par téléphone : sa commande habituelle en un clic (O3)."""
    passees = historique.commandes(sessions_precedentes(session, nombre))
    commande = commande_habituelle(passees.get(client_id, []))
    if not commande:
        message = "Ce client n'a pas de commande habituelle pour ce type de session."
        raise RefusMetier("aucune_habitude", message)
    etat, _ = cas_commandes.saisir(
        depots,
        client_id=client_id,
        session=session,
        lignes=commande,
        auteur=auteur,
        maintenant=maintenant,
        limites=limites,
    )
    return etat
