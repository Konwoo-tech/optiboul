"""Demandes de validation (CdC §5.9, O5, R19). Python pur."""

from __future__ import annotations

from enum import StrEnum


class StatutDemande(StrEnum):
    EN_ATTENTE = "en_attente"
    ACCORDEE = "accordee"
    REFUSEE = "refusee"


class Via(StrEnum):
    """Comment la décision a été prise (O5)."""

    POSTE = "poste"  # sur un poste de la boulangerie, avec sa propre session
    DISTANCE = "distance"  # depuis le téléphone, par le tunnel
    CODE = "code"  # code du gérant saisi sur le poste de la caissière


def numero_affiche(numero: int) -> str:
    """« DEM-021 » : une suite commune à toutes les demandes."""
    return f"DEM-{numero:03d}"
