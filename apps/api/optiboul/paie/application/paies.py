"""Préparer la paie du mois (US-120, CdC §5.10)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.paie.domain.paie import GenreElement
from optiboul.paie.domain.paie import StatutPaie

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal

PREPARENT = frozenset({"gerant"})


class DepotPaie(Protocol):
    def existe(self, mois: date) -> bool: ...

    def creer(self, mois: date, *, auteur: int) -> int:
        """L'état et une ligne par employé actif ; renvoie son identifiant."""
        ...

    def statut_de_la_ligne(self, ligne_id: int) -> StatutPaie | None: ...

    def modifier_ligne(
        self,
        ligne_id: int,
        *,
        absences: Decimal,
        avances: int,
    ) -> None: ...

    def ajouter_element(  # noqa: PLR0913
        self,
        ligne_id: int,
        *,
        genre: GenreElement,
        description: str,
        montant: int,
        jour: date,
        auteur: int,
    ) -> int: ...

    def ligne_de_l_element(self, element_id: int) -> int | None: ...

    def modifier_element(
        self,
        element_id: int,
        *,
        description: str,
        montant: int,
    ) -> None: ...

    def retirer_element(self, element_id: int) -> None: ...


@dataclass(frozen=True)
class Depots:
    paie: DepotPaie
    journal: Journal


def _gerant(auteur: Auteur) -> int:
    if auteur.profil not in PREPARENT or auteur.utilisateur_id is None:
        raise RefusMetier("droit_insuffisant", "Le gérant prépare la paie.")
    return auteur.utilisateur_id


def preparer(depots: Depots, *, mois: date, auteur: Auteur) -> int:
    utilisateur = _gerant(auteur)
    if depots.paie.existe(mois):
        message = f"La paie de {mois:%m/%Y} existe déjà."
        raise RefusMetier("paie_existante", message)
    etat = depots.paie.creer(mois, auteur=utilisateur)
    depots.journal.enregistrer(
        Evenement(
            action="paie.preparee",
            auteur=auteur,
            objet_type="etat_paie",
            objet_id=str(etat),
            apres={"mois": mois.isoformat()},
        ),
    )
    return etat


def exiger_brouillon(depots: Depots, ligne_id: int) -> None:
    """Rien ne se modifie hors du brouillon (CdC §5.10)."""
    statut = depots.paie.statut_de_la_ligne(ligne_id)
    if statut is None:
        raise RefusMetier("ligne_paie_inconnue", "Cette ligne de paie n'existe pas.")
    if statut is not StatutPaie.BROUILLON:
        message = "L'état de paie n'est plus en brouillon."
        raise RefusMetier("paie_non_brouillon", message)


def _verifier_element(description: str, montant: int) -> None:
    if not description.strip():
        message = "La description est obligatoire."
        raise RefusMetier("description_obligatoire", message)
    if montant <= 0:
        raise RefusMetier("montant_invalide", "Le montant est positif.")


def ajouter_element(  # noqa: PLR0913
    depots: Depots,
    *,
    ligne_id: int,
    genre: GenreElement,
    description: str,
    montant: int,
    auteur: Auteur,
    maintenant: datetime,
) -> int:
    utilisateur = _gerant(auteur)
    exiger_brouillon(depots, ligne_id)
    _verifier_element(description, montant)
    element = depots.paie.ajouter_element(
        ligne_id,
        genre=genre,
        description=description.strip(),
        montant=montant,
        jour=maintenant.date(),
        auteur=utilisateur,
    )
    depots.journal.enregistrer(
        Evenement(
            action=f"paie.{genre.value}_ajoute",
            auteur=auteur,
            objet_type="ligne_paie",
            objet_id=str(ligne_id),
            apres={"description": description.strip(), "montant": montant},
        ),
    )
    return element


def _element_en_brouillon(depots: Depots, element_id: int, auteur: Auteur) -> None:
    _gerant(auteur)
    ligne = depots.paie.ligne_de_l_element(element_id)
    if ligne is None:
        raise RefusMetier("element_paie_inconnu", "Cet élément n'existe pas.")
    exiger_brouillon(depots, ligne)


def modifier_element(
    depots: Depots,
    *,
    element_id: int,
    description: str,
    montant: int,
    auteur: Auteur,
) -> None:
    _element_en_brouillon(depots, element_id, auteur)
    _verifier_element(description, montant)
    depots.paie.modifier_element(
        element_id,
        description=description.strip(),
        montant=montant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="paie.element_modifie",
            auteur=auteur,
            objet_type="element_paie",
            objet_id=str(element_id),
            apres={"description": description.strip(), "montant": montant},
        ),
    )


def retirer_element(depots: Depots, *, element_id: int, auteur: Auteur) -> None:
    _element_en_brouillon(depots, element_id, auteur)
    depots.paie.retirer_element(element_id)
    depots.journal.enregistrer(
        Evenement(
            action="paie.element_retire",
            auteur=auteur,
            objet_type="element_paie",
            objet_id=str(element_id),
        ),
    )


def modifier_ligne(
    depots: Depots,
    *,
    ligne_id: int,
    absences: Decimal,
    avances: int,
    auteur: Auteur,
) -> None:
    _gerant(auteur)
    exiger_brouillon(depots, ligne_id)
    if absences < 0 or avances < 0:
        message = "Absences et avances ne sont pas négatives."
        raise RefusMetier("quantite_invalide", message)
    depots.paie.modifier_ligne(ligne_id, absences=absences, avances=avances)
    depots.journal.enregistrer(
        Evenement(
            action="paie.ligne_modifiee",
            auteur=auteur,
            objet_type="ligne_paie",
            objet_id=str(ligne_id),
            apres={"absences": str(absences), "avances": avances},
        ),
    )
