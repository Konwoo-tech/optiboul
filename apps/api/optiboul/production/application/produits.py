"""Cas d'usage des produits et fiches techniques (US-080, CdC §5.5)."""

from __future__ import annotations

from dataclasses import asdict
from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.production.domain.fiches import Fiche
from optiboul.production.domain.fiches import verifier_fiche

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal

# CdC §3.3 : le propriétaire et l'administrateur modifient produits et fiches,
# le gérant et le responsable de production les consultent.
MODIFIENT_LES_FICHES = frozenset({"proprietaire", "administrateur"})


@dataclass(frozen=True)
class VersionFiche:
    version: int
    fiche: Fiche


class DepotFiches(Protocol):
    def derniere(self, produit_id: int) -> VersionFiche | None: ...

    def ajouter(
        self,
        produit_id: int,
        version: int,
        fiche: Fiche,
        auteur: Auteur,
    ) -> None: ...

    def matieres(self) -> set[str]: ...


def verifier_droit(auteur: Auteur) -> None:
    if auteur.profil not in MODIFIENT_LES_FICHES:
        message = "Seuls le propriétaire et l'administrateur modifient les fiches."
        raise RefusMetier("droit_insuffisant", message)


def _trace(fiche: Fiche) -> dict[str, object]:
    contenu = asdict(fiche)
    contenu["recette"] = {code: str(q) for code, q in fiche.recette.items() if q}
    return contenu


def nouvelle_version(
    depot: DepotFiches,
    journal: Journal,
    *,
    produit_id: int,
    fiche: Fiche,
    auteur: Auteur,
) -> VersionFiche:
    """Chaque modification crée une version ; les anciennes restent consultables."""
    verifier_droit(auteur)
    verifier_fiche(fiche, depot.matieres())
    derniere = depot.derniere(produit_id)
    if derniere is not None and derniere.fiche.meme_contenu(fiche):
        message = "La fiche est identique à la version en cours."
        raise RefusMetier("fiche_inchangee", message, version=derniere.version)
    version = derniere.version + 1 if derniere else 1
    depot.ajouter(produit_id, version, fiche, auteur)
    journal.enregistrer(
        Evenement(
            action="fiche.nouvelle_version",
            auteur=auteur,
            objet_type="produit",
            objet_id=str(produit_id),
            avant=_trace(derniere.fiche) | {"version": derniere.version}
            if derniere
            else None,
            apres=_trace(fiche) | {"version": version},
        ),
    )
    return VersionFiche(version, fiche)
