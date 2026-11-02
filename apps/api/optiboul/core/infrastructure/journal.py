"""Journal enregistré en base (adaptateur du port `Journal`)."""

from __future__ import annotations

from typing import Any

from django.core.serializers.json import DjangoJSONEncoder

from optiboul.core.application.journal import SYSTEME
from optiboul.core.application.journal import Auteur
from optiboul.core.application.journal import Evenement

from .models import LigneJournal


def _json(valeurs: dict[str, Any] | None) -> dict[str, Any] | None:
    """Rend les valeurs sérialisables (dates, décimaux) avant de les figer."""
    if valeurs is None:
        return None
    encodeur = DjangoJSONEncoder()
    return {cle: _valeur(encodeur, v) for cle, v in valeurs.items()}


def _valeur(encodeur: DjangoJSONEncoder, valeur: Any) -> Any:
    if valeur is None or isinstance(valeur, (bool, int, str, list, dict)):
        return valeur
    return encodeur.default(valeur)


class JournalDjango:
    def enregistrer(self, evenement: Evenement) -> None:
        auteur = evenement.auteur
        LigneJournal.objects.create(
            acteur_id=auteur.utilisateur_id,
            acteur_nom=auteur.nom,
            profil=auteur.profil,
            poste_id=auteur.poste_id,
            poste_nom=auteur.poste,
            entree=auteur.entree,
            adresse_ip=auteur.adresse_ip,
            action=evenement.action,
            objet_type=evenement.objet_type,
            objet_id=evenement.objet_id,
            avant=_json(evenement.avant),
            apres=_json(evenement.apres),
        )


journal = JournalDjango()


def journaliser(  # noqa: PLR0913
    action: str,
    *,
    auteur: Auteur = SYSTEME,
    objet_type: str = "",
    objet_id: object = "",
    avant: dict[str, Any] | None = None,
    apres: dict[str, Any] | None = None,
) -> None:
    """Raccourci pour les adaptateurs (tâches, authentification) sans cas d'usage."""
    journal.enregistrer(
        Evenement(
            action=action,
            auteur=auteur,
            objet_type=objet_type,
            objet_id=str(objet_id),
            avant=avant,
            apres=apres,
        ),
    )
