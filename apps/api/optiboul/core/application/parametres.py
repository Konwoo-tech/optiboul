"""Cas d'usage des paramètres métier (US-023, CdC §9)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Any
from typing import Protocol

from optiboul.core.domain.parametres import CATALOGUE
from optiboul.core.domain.parametres import Definition
from optiboul.core.domain.parametres import definition

from .journal import Evenement

if TYPE_CHECKING:
    from datetime import datetime

    from .journal import Auteur
    from .journal import Journal


@dataclass(frozen=True)
class Valeur:
    valeur: Any
    auteur: str
    le: datetime


@dataclass(frozen=True)
class EtatParametre:
    definition: Definition
    valeur: Any
    derniere: Valeur | None  # None : valeur par défaut, jamais modifiée


class DepotParametres(Protocol):
    def dernieres(self) -> dict[str, Valeur]: ...

    def historique(self, cle: str) -> list[Valeur]: ...

    def enregistrer(self, cle: str, valeur: Any, auteur: Auteur) -> None: ...


def etats(depot: DepotParametres) -> list[EtatParametre]:
    dernieres = depot.dernieres()
    resultat = []
    for item in CATALOGUE:
        derniere = dernieres.get(item.cle)
        valeur = derniere.valeur if derniere else item.defaut
        resultat.append(EtatParametre(item, valeur, derniere))
    return resultat


def modifier(
    depot: DepotParametres,
    journal: Journal,
    *,
    cle: str,
    valeur: Any,
    auteur: Auteur,
) -> Any:
    """Valide puis enregistre la valeur ; l'ancienne reste dans l'historique."""
    item = definition(cle)
    nouvelle = item.valider(valeur)
    derniere = depot.dernieres().get(cle)
    ancienne = derniere.valeur if derniere else item.defaut
    if nouvelle == ancienne:
        return nouvelle
    depot.enregistrer(cle, nouvelle, auteur)
    journal.enregistrer(
        Evenement(
            action="parametre.modifie",
            auteur=auteur,
            objet_type="parametre",
            objet_id=cle,
            avant={"valeur": ancienne},
            apres={"valeur": nouvelle},
        ),
    )
    return nouvelle
