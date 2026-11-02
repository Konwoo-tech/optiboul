"""Journal des actions (R1, CdC §5.12) : port utilisé par les cas d'usage."""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from enum import StrEnum
from typing import Any
from typing import Protocol


class Entree(StrEnum):
    """Point d'entrée de la requête : réseau de la boulangerie ou tunnel (ADR-19)."""

    LOCALE = "locale"
    DISTANTE = "distante"


@dataclass(frozen=True)
class Auteur:
    """Qui agit, depuis où. Renseigné par l'API, jamais par le client (R1)."""

    utilisateur_id: int | None
    nom: str = ""
    profil: str = ""
    poste_id: int | None = None
    poste: str = ""
    entree: Entree = Entree.LOCALE
    adresse_ip: str | None = None


SYSTEME = Auteur(utilisateur_id=None, nom="Système")


@dataclass(frozen=True)
class Evenement:
    """Une ligne du journal : action, objet concerné, valeurs avant / après."""

    action: str
    auteur: Auteur
    objet_type: str = ""
    objet_id: str = ""
    avant: dict[str, Any] | None = None
    apres: dict[str, Any] | None = field(default=None)


class Journal(Protocol):
    def enregistrer(self, evenement: Evenement) -> None: ...
