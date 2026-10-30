"""Clôture de la semaine (US-033, CdC §5.1, R3, R20).

Chaque application déclare ses contrôles avant clôture et ses actions à la clôture
(caisse ouverte, production en cours, dettes reportées…) : la semaine ne dépend
d'aucune d'elles.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from dataclasses import field
from enum import StrEnum
from typing import TYPE_CHECKING
from typing import Any

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.semaines import Statut
from optiboul.core.domain.semaines import code

from .journal import Evenement
from .semaines import obtenir_semaine
from .semaines import peut_ouvrir_ou_cloturer

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.notifications.application.ports import Notificateur

    from .journal import Auteur
    from .journal import Journal
    from .semaines import DepotSemaines
    from .semaines import EtatSemaine


class Niveau(StrEnum):
    OK = "ok"
    SURVEILLER = "surveiller"  # « à voir » : n'empêche pas la clôture
    BLOQUANT = "bloquant"


@dataclass(frozen=True)
class Controle:
    cle: str
    niveau: Niveau
    detail: str = ""
    donnees: dict[str, Any] = field(default_factory=dict)


FournisseurControle = Callable[["EtatSemaine"], Controle]
ActionCloture = Callable[["EtatSemaine", "Auteur"], None]
# Clôture forcée : archive les objets encore ouverts, renvoie ce qui l'a été.
Archivage = Callable[["EtatSemaine", "Auteur"], list[str]]

_CONTROLES: dict[str, FournisseurControle] = {}
_ACTIONS: dict[str, ActionCloture] = {}
_ARCHIVAGES: dict[str, Archivage] = {}


def enregistrer_archivage(cle: str, archivage: Archivage) -> None:
    _ARCHIVAGES[cle] = archivage


def enregistrer_controle(cle: str, fournisseur: FournisseurControle) -> None:
    _CONTROLES[cle] = fournisseur


def enregistrer_action(cle: str, action: ActionCloture) -> None:
    _ACTIONS[cle] = action


def controles(semaine: EtatSemaine) -> list[Controle]:
    return [fournisseur(semaine) for fournisseur in _CONTROLES.values()]


def cloturer(
    depot: DepotSemaines,
    journal: Journal,
    *,
    semaine_id: int,
    auteur: Auteur,
    maintenant: datetime,
) -> list[Controle]:
    """R3 : refusée tant qu'un contrôle bloque ; les « à voir » sont tracés."""
    semaine = obtenir_semaine(depot, semaine_id)
    if not peut_ouvrir_ou_cloturer(semaine, auteur):
        message = "Seuls le propriétaire et le gérant de la semaine la clôturent."
        raise RefusMetier("droit_insuffisant", message)
    if semaine.statut is not Statut.OUVERTE:
        message = "Seule une semaine ouverte se clôture."
        raise RefusMetier("semaine_non_ouverte", message)
    resultats = controles(semaine)
    if bloquants := [c for c in resultats if c.niveau is Niveau.BLOQUANT]:
        message = " ".join(c.detail for c in bloquants)
        raise RefusMetier(
            "cloture_bloquee",
            message,
            controles=[projeter(c) for c in resultats],
        )
    for action in _ACTIONS.values():
        action(semaine, auteur)
    depot.cloturer(semaine.id, auteur.utilisateur_id, maintenant)
    journal.enregistrer(
        Evenement(
            action="semaine.cloturee",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine.id),
            avant={"statut": semaine.statut},
            apres={
                "statut": Statut.CLOTUREE,
                "a_voir": [c.cle for c in resultats if c.niveau is Niveau.SURVEILLER],
            },
        ),
    )
    return resultats


def cloturer_forcee(  # noqa: PLR0913
    depot: DepotSemaines,
    journal: Journal,
    notificateur: Notificateur,
    *,
    semaine_id: int,
    motif: str,
    auteur: Auteur,
    maintenant: datetime,
) -> list[str]:
    """Le propriétaire, avec un motif (O8) : les éléments ouverts sont archivés
    « non clôturés » et remontent en alerte ; la semaine suivante peut s'ouvrir."""
    if auteur.profil != "proprietaire":
        message = "Seul le propriétaire force la clôture d'une semaine."
        raise RefusMetier("droit_insuffisant", message)
    if not motif.strip():
        message = "Le motif de la clôture forcée est obligatoire."
        raise RefusMetier("motif_obligatoire", message)
    semaine = obtenir_semaine(depot, semaine_id)
    if semaine.statut is not Statut.OUVERTE:
        message = "Seule une semaine ouverte se clôture."
        raise RefusMetier("semaine_non_ouverte", message)
    archives = [
        objet
        for archivage in _ARCHIVAGES.values()
        for objet in archivage(semaine, auteur)
    ]
    for action in _ACTIONS.values():
        action(semaine, auteur)
    depot.cloturer(semaine.id, auteur.utilisateur_id, maintenant)
    depot.marquer_forcee(semaine.id, motif.strip())
    journal.enregistrer(
        Evenement(
            action="semaine.cloturee_forcee",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine.id),
            avant={"statut": semaine.statut},
            apres={
                "statut": Statut.CLOTUREE,
                "motif": motif.strip(),
                "non_clotures": archives,
            },
        ),
    )
    if archives:
        notificateur.notifier_profils(
            ["gerant", "proprietaire"],
            genre="semaine.cloture_forcee",
            titre=f"Semaine {code(semaine.numero)} clôturée de force",
            message=f"Non clôturés : {', '.join(archives)}. Motif : {motif.strip()}",
            lien="/gestion/semaines",
        )
    return archives


def projeter(controle: Controle) -> dict[str, Any]:
    return {
        "cle": controle.cle,
        "niveau": controle.niveau,
        "detail": controle.detail,
        **controle.donnees,
    }
