"""Cas d'usage des demandes de validation (US-070, CdC §5.9, O5).

Chaque application déclare ses types de demande (plafond, dépense, plan…) : qui les
émet, qui les valide, l'objet qu'elles débloquent. Le circuit reste le même pour tous.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from typing import TYPE_CHECKING
from typing import Any
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.demandes.domain.demandes import StatutDemande
from optiboul.demandes.domain.demandes import numero_affiche

if TYPE_CHECKING:
    from collections.abc import Callable
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.notifications.application.ports import Notificateur

SEQUENCE_DEMANDES = "demande"


@dataclass(frozen=True)
class ObjetLie:
    """L'objet bloqué, tel que la demande l'affiche et le garde."""

    libelle: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EtatDemande:
    id: int
    numero: int
    type: str
    objet_type: str
    objet_id: int
    objet: str
    details: dict[str, Any]
    motif: str
    emetteur: int | None
    emetteur_profil: str
    valideurs: tuple[str, ...]
    statut: StatutDemande

    @property
    def code(self) -> str:
        return numero_affiche(self.numero)


def _rien(demande: EtatDemande, auteur: Auteur) -> None:
    return None


@dataclass(frozen=True)
class TypeDemande:
    cle: str
    libelle: str
    objet_type: str
    emetteurs: frozenset[str]
    # Profil de l'émetteur → profils qui valident (CdC §5.9).
    valideurs: Callable[[str], tuple[str, ...]]
    # Vérifie que l'objet existe et attend une validation ; décrit l'objet lié.
    preparer: Callable[[int, Auteur], ObjetLie]
    # L'objet lié change de statut avec la décision (US-071).
    sur_accord: Callable[[EtatDemande, Auteur], None] = _rien
    sur_refus: Callable[[EtatDemande, Auteur], None] = _rien
    lien: str = "/gestion/demandes"


_TYPES: dict[str, TypeDemande] = {}


def enregistrer_type(type_demande: TypeDemande) -> None:
    _TYPES[type_demande.cle] = type_demande


def types() -> dict[str, TypeDemande]:
    return dict(_TYPES)


def type_de(cle: str) -> TypeDemande:
    try:
        return _TYPES[cle]
    except KeyError:
        message = f"Type de demande inconnu : {cle}."
        raise RefusMetier("type_demande_inconnu", message) from None


class DepotDemandes(Protocol):
    def creer(  # noqa: PLR0913
        self,
        *,
        numero: int,
        type_demande: TypeDemande,
        objet_id: int,
        objet: ObjetLie,
        motif: str,
        valideurs: tuple[str, ...],
        auteur: Auteur,
        le: datetime,
    ) -> int: ...

    def obtenir(self, demande_id: int) -> EtatDemande | None: ...

    def en_attente_pour(self, type_cle: str, objet_id: int) -> EtatDemande | None: ...


class Numeros(Protocol):
    def prochain(self, nom: str) -> int: ...


class Telephones(Protocol):
    def prevenir(self, profils: tuple[str, ...], message: str) -> None:
        """Message sur le téléphone des valideurs, par la file d'envoi (O5, R22)."""
        ...


@dataclass(frozen=True)
class Depots:
    demandes: DepotDemandes
    numeros: Numeros
    journal: Journal
    notificateur: Notificateur
    telephones: Telephones


def obtenir(depots: Depots, demande_id: int) -> EtatDemande:
    demande = depots.demandes.obtenir(demande_id)
    if demande is None:
        message = "Demande inconnue."
        raise RefusMetier("demande_inconnue", message)
    return demande


def emettre(  # noqa: PLR0913
    depots: Depots,
    *,
    type_cle: str,
    objet_id: int,
    motif: str,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatDemande:
    """DEM-xxx liée à l'objet bloqué, avec un motif ; valideurs prévenus (O5)."""
    type_demande = type_de(type_cle)
    if auteur.profil not in type_demande.emetteurs:
        message = f"Votre profil n'émet pas de demande « {type_demande.libelle} »."
        raise RefusMetier("droit_insuffisant", message)
    if not motif.strip():
        message = "Le motif de la demande est obligatoire."
        raise RefusMetier("motif_obligatoire", message)
    if deja := depots.demandes.en_attente_pour(type_cle, objet_id):
        message = f"Une demande attend déjà une réponse : {deja.code}."
        raise RefusMetier("demande_deja_en_attente", message, demande=deja.id)
    objet = type_demande.preparer(objet_id, auteur)
    valideurs = type_demande.valideurs(auteur.profil)
    demande_id = depots.demandes.creer(
        numero=depots.numeros.prochain(SEQUENCE_DEMANDES),
        type_demande=type_demande,
        objet_id=objet_id,
        objet=objet,
        motif=motif.strip(),
        valideurs=valideurs,
        auteur=auteur,
        le=maintenant,
    )
    demande = obtenir(depots, demande_id)
    depots.journal.enregistrer(
        Evenement(
            action="demande.emise",
            auteur=auteur,
            objet_type="demande",
            objet_id=str(demande_id),
            apres={
                "numero": demande.code,
                "type": type_cle,
                "objet_type": type_demande.objet_type,
                "objet_id": objet_id,
                "motif": demande.motif,
                "valideurs": list(valideurs),
            },
        ),
    )
    titre = f"{demande.code} · {type_demande.libelle}"
    texte = f"{objet.libelle} — {demande.motif} (par {auteur.nom})"
    depots.notificateur.notifier_profils(
        valideurs,
        genre="demande.emise",
        titre=titre,
        message=texte,
        lien=type_demande.lien,
    )
    depots.telephones.prevenir(valideurs, f"OptiBoul : {titre}. {texte}")
    return demande


def visible_par(demande: EtatDemande, auteur: Auteur) -> bool:
    """L'émetteur, les valideurs et le propriétaire voient la demande."""
    return (
        auteur.profil == "proprietaire"
        or auteur.profil in demande.valideurs
        or (demande.emetteur is not None and demande.emetteur == auteur.utilisateur_id)
    )
