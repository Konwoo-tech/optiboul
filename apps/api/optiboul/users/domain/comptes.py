"""Comptes (CdC §5.12) et accès par profil (CdC §3.3). Python pur."""

from __future__ import annotations

import re
from typing import Any

_TELEPHONE = re.compile(r"^6\d{8}$")


class CompteInvalide(ValueError):  # noqa: N818
    pass


def normaliser_gmail(email: str) -> str:
    """Seuls les Gmail sont acceptés (connexion Google, CdC §4.1)."""
    adresse = email.strip().lower()
    if not re.fullmatch(r"[a-z0-9._%+-]+@gmail\.com", adresse):
        message = "Adresse Gmail attendue (…@gmail.com)."
        raise CompteInvalide(message)
    return adresse


def normaliser_telephone(telephone: str) -> str:
    """« +237 6 77 41 20 18 » → « 677412018 » : 9 chiffres commençant par 6."""
    chiffres = re.sub(r"[\s.\-()]", "", telephone)
    chiffres = chiffres.removeprefix("+237").removeprefix("00237")
    if not _TELEPHONE.match(chiffres):
        message = "Numéro camerounais attendu : +237 puis 9 chiffres commençant par 6."
        raise CompteInvalide(message)
    return chiffres


# Espaces et écran d'arrivée de l'application web (apps/web/src/profils.ts, O10).
ESPACES: dict[str, tuple[str, ...]] = {
    "caissier": ("comptoir",),
    "production": ("atelier",),
    "gerant": ("gestion", "comptoir", "atelier"),
    "proprietaire": ("gestion", "comptoir", "atelier"),
    "administrateur": ("gestion",),
}

# Matrice des droits (CdC §3.3), lue par l'aperçu des accès.
FONCTIONS: dict[str, tuple[str, ...]] = {
    "caissier": (
        "Ouvrir et fermer sa caisse",
        "Saisir livraisons et encaissements",
        "Demander une livraison au-delà du plafond",
        "Saisir les remises au coffre",
        "Saisir les dépenses de caisse",
    ),
    "gerant": (
        "Ouvrir et fermer une caisse, rouvrir une caisse fermée",
        "Autoriser les livraisons au-delà du plafond",
        "Planning des caisses ; ouvrir et clôturer la semaine affectée",
        "Valider le plan de production de la semaine affectée",
        "Pré-autoriser les achats courants",
        "Réceptions et paiement des fournisseurs",
        "Contrôles de stock et inventaires",
        "Saisir et valider les dépenses",
        "Préparer et payer la paie",
    ),
    "production": (
        "Proposer, ouvrir et clôturer la production de la semaine affectée",
        "Demander une augmentation de production",
        "Réceptionner les livraisons",
        "Contrôles de stock et inventaires",
        "Saisir les dépenses de production",
    ),
    "proprietaire": (
        "Planifier les semaines, affectations et planning des caisses",
        "Ouvrir, clôturer et forcer la clôture d'une semaine",
        "Rouvrir une caisse fermée ; autoriser les dépassements",
        "Valider le plan, les dépenses, la paie et les inventaires en écart",
        "Modifier les fiches techniques et les paramètres métier",
    ),
    "administrateur": (
        "Comptes, groupes et postes de confiance",
        "Sauvegardes et restauration",
        "Consulter les paramètres et le journal",
    ),
}


def apercu(profil: str) -> dict[str, Any]:
    espaces = ESPACES.get(profil, ())
    return {
        "profil": profil,
        "espaces": list(espaces),
        "accueil": f"/{espaces[0]}" if espaces else None,
        "fonctions": list(FONCTIONS.get(profil, ())),
    }
