"""Historique des commandes et rappels WhatsApp des clients habituels (O18)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import Q

from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import Relance
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi
from optiboul.ventes.domain.commandes import heure_limite

from .commandes import limites
from .models import Commande

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur
    from optiboul.ventes.application.habitudes import Habituel
    from optiboul.ventes.domain.commandes import Session


class HistoriqueDjango:
    def commandes(self, sessions: list[Session]) -> dict[int, list[dict[str, int]]]:
        filtre = Q(pk__in=[])
        for session in sessions:
            filtre |= Q(jour=session.jour, creneau=session.creneau)
        resultat: dict[int, list[dict[str, int]]] = {}
        passees = (
            Commande.objects.filter(filtre, client__actif=True)
            .prefetch_related("lignes__produit")
            .order_by("-jour")
        )
        for commande in passees:
            lignes = {
                ligne.produit.code: ligne.quantite for ligne in commande.lignes.all()
            }
            resultat.setdefault(commande.client_id, []).append(lignes)
        return resultat


historique = HistoriqueDjango()


def nombre_de_sessions() -> int:
    """Moyenne des 4 dernières sessions du même type (paramètre, CdC §9)."""
    return parametre("demande_estimee_sessions")


def texte_rappel(nom: str, session: Session, commande: dict[str, int]) -> str:
    moment = (
        "ce soir" if session.creneau == "nuit" else f"le {session.jour:%d/%m} au matin"
    )
    detail = ", ".join(f"{code} {quantite}" for code, quantite in commande.items())
    limite = heure_limite(session, limites())
    return (
        f"Bonjour {nom}, la Boulangerie du Faubourg prépare la production {moment}. "
        f"Votre commande habituelle ({detail}) ? Répondez avant {limite:%H:%M}."
    )


def relances_de_la_session(session: Session) -> dict[int, Relance]:
    """Dernier rappel de commande de chaque client pour cette session."""
    rappels: dict[int, Relance] = {}
    for relance in (
        Relance.objects.filter(
            motif="commande",
            jour=session.jour,
            creneau=session.creneau,
        )
        .select_related("message", "auteur")
        .order_by("cree_le", "id")
    ):
        rappels[relance.client_id] = relance
    return rappels


def rappeler(
    habituels: list[Habituel],
    *,
    session: Session,
    auteur: Auteur,
    automatique: bool,
) -> list[Relance]:
    """Un WhatsApp par habituel qui a un numéro, par la file d'envoi (O15, O18)."""
    clients = Client.objects.in_bulk([h.client for h in habituels])
    rappels = []
    for habituel in habituels:
        client = clients[habituel.client]
        if not client.telephone:
            continue
        message_id = file_envoi.mettre_en_file(
            Canal.WHATSAPP,
            client.telephone,
            texte_rappel(client.nom, session, habituel.commande),
            objet_type="client",
            objet_id=client.pk,
        )
        rappels.append(
            Relance.objects.create(
                client=client,
                motif="commande",
                jour=session.jour,
                creneau=session.creneau,
                message_id=message_id,
                automatique=automatique,
                auteur_id=auteur.utilisateur_id,
            ),
        )
    if rappels:
        journaliser(
            "commandes.rappel_habituels",
            auteur=auteur,
            objet_type="session",
            objet_id=f"{session.jour.isoformat()}-{session.creneau}",
            apres={
                "clients": [r.client_id for r in rappels],
                "automatique": automatique,
            },
        )
    return rappels
