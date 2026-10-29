"""Paramètres enregistrés en base, lus via le cache (spécification §4.2)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.core.cache import cache
from django.db import transaction

from optiboul.core.application.parametres import Valeur
from optiboul.core.domain.parametres import definition

from .models import ValeurParametre

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur

CLE_CACHE = "optiboul:parametres"


class DepotParametresDjango:
    def dernieres(self) -> dict[str, Valeur]:
        lignes = ValeurParametre.objects.order_by("cle", "-cree_le", "-id").distinct(
            "cle",
        )
        return {
            ligne.cle: Valeur(ligne.valeur, ligne.auteur_nom, ligne.cree_le)
            for ligne in lignes
        }

    def historique(self, cle: str) -> list[Valeur]:
        lignes = ValeurParametre.objects.filter(cle=cle).order_by("-cree_le", "-id")
        return [
            Valeur(ligne.valeur, ligne.auteur_nom, ligne.cree_le) for ligne in lignes
        ]

    def enregistrer(self, cle: str, valeur: Any, auteur: Auteur) -> None:
        ValeurParametre.objects.create(
            cle=cle,
            valeur=valeur,
            auteur_id=auteur.utilisateur_id,
            auteur_nom=auteur.nom,
        )
        cache.delete(CLE_CACHE)
        transaction.on_commit(lambda: cache.delete(CLE_CACHE))


depot_parametres = DepotParametresDjango()


def parametre(cle: str) -> Any:
    """Valeur courante d'un paramètre, pour les autres applications (cache invalidé)."""
    valeurs = cache.get(CLE_CACHE)
    if valeurs is None:
        valeurs = {c: v.valeur for c, v in depot_parametres.dernieres().items()}
        cache.set(CLE_CACHE, valeurs, timeout=None)
    return valeurs.get(cle, definition(cle).defaut)
