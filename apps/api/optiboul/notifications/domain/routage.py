"""Qui reçoit quelle notification (CdC §5.13). Python pur.

Chaque notification n'est envoyée qu'aux rôles concernés ; le propriétaire peut
ajouter un envoi par SMS ou WhatsApp à un type, en plus de l'application.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

TOUTE_L_EQUIPE = ("caissier", "gerant", "production", "proprietaire", "administrateur")


class CanalNotification(StrEnum):
    APPLICATION = "application"  # toujours : poste et téléphone, dans l'en-tête
    SMS = "sms"
    WHATSAPP = "whatsapp"


@dataclass(frozen=True)
class Regle:
    genre: str
    libelle: str
    profils: tuple[str, ...]
    canaux: tuple[CanalNotification, ...] = (CanalNotification.APPLICATION,)


# Table de routage du CdC §5.13, dans l'ordre du tableau.
REGLES_DE_DEPART: tuple[Regle, ...] = (
    Regle("semaine.publiee", "Programmation de la semaine publiée", TOUTE_L_EQUIPE),
    Regle("plan.propose", "Plan proposé", ("gerant", "proprietaire")),
    Regle("plan.valide", "Plan validé", ("production", "caissier", "gerant")),
    Regle(
        "plan.provisoire",
        "Production démarrée provisoire",
        ("gerant", "proprietaire"),
    ),
    Regle("production.ouverte", "Production ouverte", ("gerant", "caissier")),
    Regle("production.cloturee", "Production clôturée", ("gerant", "proprietaire")),
    Regle(
        "commandes.habituels",
        "Clients habituels sans commande",
        ("caissier", "gerant", "proprietaire"),
    ),
    Regle(
        "plan.demande_superieure",
        "Demande estimée au-dessus du plan",
        ("production", "gerant", "proprietaire"),
    ),
    Regle(
        "production.reste_a_produire",
        "Reste à produire",
        ("production", "gerant", "caissier", "proprietaire"),
    ),
    Regle(
        "supplement.demande",
        "Demande d'augmentation de production",
        ("gerant", "proprietaire"),
    ),
    Regle(
        "supplement.decision",
        "Décision sur l'augmentation de production",
        ("production", "caissier"),
    ),
    Regle(
        "stock.controle",
        "Contrôle de stock à faire ou manqué",
        ("gerant", "production", "proprietaire"),
    ),
    Regle("commande.tardive", "Commande tardive", ("production", "gerant")),
)

PAR_GENRE = {regle.genre: regle for regle in REGLES_DE_DEPART}
