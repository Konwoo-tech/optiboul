"""Numéros métier sans trou ni doublon : bons de livraison, DEM-xxx… (§4.2)."""

from __future__ import annotations

from django.db.models import F

from .models import SequenceNumero


def prochain_numero(nom: str) -> int:
    """À appeler dans la transaction de l'opération : annulée, le numéro est rendu."""
    SequenceNumero.objects.get_or_create(nom=nom)
    SequenceNumero.objects.filter(nom=nom).update(dernier=F("dernier") + 1)
    return SequenceNumero.objects.get(nom=nom).dernier
