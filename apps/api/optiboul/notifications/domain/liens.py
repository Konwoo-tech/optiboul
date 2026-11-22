"""Liens des notifications vers les écrans du front (#298). Python pur.

Un lien est un chemin d'écran `/{espace}/{écran}`, éventuellement suivi de
paramètres connus ; un lien vide signifie une notification sans écran.
"""

from __future__ import annotations

from urllib.parse import parse_qsl
from urllib.parse import urlsplit

ECRANS: dict[str, frozenset[str]] = {
    "comptoir": frozenset({"session", "caisses", "clients", "depenses", "demandes"}),
    "atelier": frozenset({"production", "stocks", "semaines"}),
    "gestion": frozenset(
        {
            "tableau-de-bord",
            "semaines",
            "clients",
            "fournisseurs",
            "depenses",
            "personnel",
            "demandes",
            "utilisateurs",
            "sauvegardes",
            "journal",
            "parametres",
        },
    ),
}
# `onglet` choisit l'onglet de l'écran ; `passation` ouvre le rapport d'une semaine.
PARAMETRES = frozenset({"onglet", "passation"})


def est_lien_d_ecran(lien: str) -> bool:
    if not lien:
        return True
    morceaux = urlsplit(lien)
    parties = morceaux.path.strip("/").split("/")
    if not morceaux.path.startswith("/") or len(parties) != 2:  # noqa: PLR2004
        return False
    espace, ecran = parties
    if ecran not in ECRANS.get(espace, frozenset()):
        return False
    return all(cle in PARAMETRES for cle, _ in parse_qsl(morceaux.query))
