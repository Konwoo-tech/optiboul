"""Rapport de passation (US-034, CdC §5.1), envoyé au gérant de la semaine suivante.

Chaque application fournit sa section (caisses, dettes, stock bas) et ses incidents :
le rapport ne dépend d'aucune d'elles.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Any

from optiboul.core.domain.semaines import suivante as numero_suivant

from .semaines import obtenir_semaine

if TYPE_CHECKING:
    from .semaines import DepotSemaines
    from .semaines import EtatSemaine

# Sections du CdC §5.1, dans l'ordre du rapport.
SECTIONS = {
    "caisses": "Caisses et écart cumulé",
    "dettes_clients": "Dettes clients reportées",
    "dettes_fournisseurs": "Dettes fournisseurs",
    "stock_bas": "Stock bas",
}

FournisseurSection = Callable[["EtatSemaine"], dict[str, Any]]
FournisseurIncidents = Callable[["EtatSemaine"], list[str]]

_SECTIONS: dict[str, FournisseurSection] = {}
_INCIDENTS: dict[str, FournisseurIncidents] = {}


def enregistrer_section(cle: str, fournisseur: FournisseurSection) -> None:
    _SECTIONS[cle] = fournisseur


def enregistrer_incidents(cle: str, fournisseur: FournisseurIncidents) -> None:
    _INCIDENTS[cle] = fournisseur


@dataclass(frozen=True)
class Section:
    cle: str
    titre: str
    contenu: dict[str, Any] | None  # None : aucune application ne la fournit encore


@dataclass(frozen=True)
class Passation:
    semaine: EtatSemaine
    suivante: EtatSemaine | None
    sections: list[Section]
    incidents: list[str]


def preparer(depot: DepotSemaines, semaine_id: int) -> Passation:
    semaine = obtenir_semaine(depot, semaine_id)
    suivante = depot.par_numero(*numero_suivant(semaine.annee, semaine.numero))
    sections = [
        Section(cle, titre, _SECTIONS[cle](semaine) if cle in _SECTIONS else None)
        for cle, titre in SECTIONS.items()
    ]
    incidents = [ligne for f in _INCIDENTS.values() for ligne in f(semaine)]
    return Passation(semaine, suivante, sections, incidents)
