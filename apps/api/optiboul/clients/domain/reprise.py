"""Reprise du classeur Excel (US-150, CdC §11.7). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from optiboul.clients.domain.clients import TypeClient
from optiboul.clients.domain.clients import telephone_du_client
from optiboul.core.domain.erreurs import RefusMetier


class LigneRejetee(ValueError):  # noqa: N818
    pass


@dataclass(frozen=True)
class LigneClient:
    nom: str
    type: TypeClient
    telephone: str
    lieu: str
    plafond: int | None
    solde: int  # négatif : le client doit de l'argent (R21)


def _entier(valeur: Any, champ: str) -> int:
    """Montants en entiers FCFA : un montant à virgule est une erreur de saisie."""
    if isinstance(valeur, bool) or not isinstance(valeur, int | float):
        message = f"{champ} : nombre entier attendu."
        raise LigneRejetee(message)
    if int(valeur) != valeur:
        message = f"{champ} : montant à virgule."
        raise LigneRejetee(message)
    return int(valeur)


def lire_client(valeurs: dict[str, Any]) -> LigneClient:
    nom = str(valeurs.get("nom") or "").strip()
    if not nom:
        message = "Nom manquant."
        raise LigneRejetee(message)
    type_brut = str(valeurs.get("type") or TypeClient.LIVREUR).strip().lower()
    try:
        type_client = TypeClient(type_brut)
    except ValueError:
        message = f"Type inconnu : {type_brut}."
        raise LigneRejetee(message) from None
    try:
        telephone = telephone_du_client(str(valeurs.get("telephone") or ""))
    except RefusMetier as refus:
        raise LigneRejetee(refus.detail) from None
    plafond = valeurs.get("plafond")
    solde = valeurs.get("solde")
    return LigneClient(
        nom=nom,
        type=type_client,
        telephone=telephone,
        lieu=str(valeurs.get("lieu") or "").strip(),
        plafond=None if plafond in {None, ""} else _entier(plafond, "Plafond"),
        solde=0 if solde in {None, ""} else _entier(solde, "Solde"),
    )


def lire_tarif(valeurs: dict[str, Any]) -> tuple[str, str, int]:
    client = str(valeurs.get("client") or "").strip()
    produit = str(valeurs.get("produit") or "").strip().upper()
    if not client or not produit:
        message = "Client ou produit manquant."
        raise LigneRejetee(message)
    prix = _entier(valeurs.get("prix"), "Prix")
    if prix <= 0:
        message = "Prix : positif attendu."
        raise LigneRejetee(message)
    return client, produit, prix
