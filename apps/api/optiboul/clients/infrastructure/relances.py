"""Relances WhatsApp des dettes (US-062, CdC §5.4) par la file d'envoi (O15)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from optiboul.clients.domain.clients import texte_relance
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.templatetags.optiboul import fcfa
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi

from .comptes import solde_de
from .models import Client
from .models import Relance

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur

SANS_TELEPHONE, SANS_DETTE = "sans_telephone", "sans_dette"


@dataclass(frozen=True)
class Resultat:
    relances: list[Relance]
    ignores: list[tuple[Client, str]]  # client et raison


def relancer_dettes(
    clients: list[Client],
    *,
    auteur: Auteur,
    automatique: bool = False,
) -> Resultat:
    """Un WhatsApp par client qui doit de l'argent et a un numéro ; les autres sont
    signalés, pas relancés."""
    echeance = parametre("echeance_dettes")
    relances, ignores = [], []
    for client in clients:
        dette = -solde_de(client.pk)
        if dette <= 0:
            ignores.append((client, SANS_DETTE))
            continue
        if not client.telephone:
            ignores.append((client, SANS_TELEPHONE))
            continue
        message_id = file_envoi.mettre_en_file(
            Canal.WHATSAPP,
            client.telephone,
            texte_relance(client.nom, echeance, fcfa(dette)),
            objet_type="client",
            objet_id=client.pk,
        )
        relances.append(
            Relance.objects.create(
                client=client,
                motif="dette",
                message_id=message_id,
                montant=dette,
                automatique=automatique,
                auteur_id=auteur.utilisateur_id,
            ),
        )
    if relances:
        journaliser(
            "clients.relances",
            auteur=auteur,
            objet_type="client",
            objet_id=relances[0].client_id if len(relances) == 1 else "",
            apres={
                "clients": [r.client_id for r in relances],
                "total": sum(r.montant for r in relances),
                "automatique": automatique,
            },
        )
    return Resultat(relances, ignores)
