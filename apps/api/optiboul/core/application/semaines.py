"""Cas d'usage des semaines (US-030 à US-035, CdC §5.1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.semaines import Bornes
from optiboul.core.domain.semaines import Statut
from optiboul.core.domain.semaines import bornes
from optiboul.core.domain.semaines import conflits_affectation
from optiboul.core.domain.semaines import precedente
from optiboul.core.domain.semaines import proposer_rotation

from .journal import Evenement

if TYPE_CHECKING:
    from .journal import Auteur
    from .journal import Journal


@dataclass(frozen=True)
class EtatSemaine:
    id: int
    annee: int
    numero: int
    statut: Statut
    gerant: int | None
    production: int | None


class DepotSemaines(Protocol):
    def obtenir(self, semaine_id: int) -> EtatSemaine | None: ...

    def par_numero(self, annee: int, numero: int) -> EtatSemaine | None: ...

    def creer(
        self,
        annee: int,
        numero: int,
        periode: Bornes,
        par: int | None,
    ) -> int: ...

    def affecter(
        self,
        semaine_id: int,
        gerant: int | None,
        production: int | None,
    ) -> None: ...

    def profil(self, utilisateur_id: int) -> str | None: ...

    def inactifs(self, ids: set[int]) -> set[int]: ...

    def candidats(self, profil: str) -> list[int]: ...


def _verifier_profil(
    depot: DepotSemaines,
    utilisateur: int | None,
    attendu: str,
) -> None:
    if utilisateur is not None and depot.profil(utilisateur) != attendu:
        champ = "gérant" if attendu == "gerant" else "responsable de production"
        message = f"Cette personne n'a pas le profil {champ}."
        raise RefusMetier("profil_inadapte", message, role=attendu)


def _conflits(depot: DepotSemaines, semaine: EtatSemaine) -> list[str]:
    avant = depot.par_numero(*precedente(semaine.annee, semaine.numero))
    affectes = {i for i in (semaine.gerant, semaine.production) if i is not None}
    return conflits_affectation(
        gerant=semaine.gerant,
        production=semaine.production,
        gerant_precedent=avant.gerant if avant else None,
        production_precedente=avant.production if avant else None,
        inactifs=depot.inactifs(affectes),
    )


def planifier(  # noqa: PLR0913
    depot: DepotSemaines,
    journal: Journal,
    *,
    annee: int,
    numero: int,
    gerant: int | None,
    production: int | None,
    auteur: Auteur,
) -> tuple[EtatSemaine, list[str]]:
    """Planification par le propriétaire ; les conflits sont signalés, pas bloquants."""
    if depot.par_numero(annee, numero) is not None:
        message = f"La semaine {numero} de {annee} est déjà planifiée."
        raise RefusMetier("semaine_existante", message)
    _verifier_profil(depot, gerant, "gerant")
    _verifier_profil(depot, production, "production")
    semaine_id = depot.creer(
        annee,
        numero,
        bornes(annee, numero),
        auteur.utilisateur_id,
    )
    depot.affecter(semaine_id, gerant, production)
    journal.enregistrer(
        Evenement(
            action="semaine.planifiee",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine_id),
            apres={
                "annee": annee,
                "numero": numero,
                "gerant": gerant,
                "production": production,
            },
        ),
    )
    semaine = depot.obtenir(semaine_id)
    assert semaine is not None
    return semaine, _conflits(depot, semaine)


def affecter(  # noqa: PLR0913
    depot: DepotSemaines,
    journal: Journal,
    *,
    semaine_id: int,
    gerant: int | None,
    production: int | None,
    auteur: Auteur,
) -> tuple[EtatSemaine, list[str]]:
    semaine = _semaine(depot, semaine_id)
    if semaine.statut is Statut.CLOTUREE:
        message = "Une semaine clôturée ne change plus d'affectations."
        raise RefusMetier("semaine_cloturee", message)
    _verifier_profil(depot, gerant, "gerant")
    _verifier_profil(depot, production, "production")
    depot.affecter(semaine_id, gerant, production)
    journal.enregistrer(
        Evenement(
            action="semaine.affectations",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine_id),
            avant={"gerant": semaine.gerant, "production": semaine.production},
            apres={"gerant": gerant, "production": production},
        ),
    )
    apres = _semaine(depot, semaine_id)
    return apres, _conflits(depot, apres)


def copier_precedente(
    depot: DepotSemaines,
    journal: Journal,
    *,
    semaine_id: int,
    auteur: Auteur,
) -> tuple[EtatSemaine, list[str]]:
    """« Copier la semaine précédente » (O9) : mêmes affectations."""
    semaine = _semaine(depot, semaine_id)
    avant = depot.par_numero(*precedente(semaine.annee, semaine.numero))
    if avant is None:
        message = "Aucune semaine précédente à copier."
        raise RefusMetier("pas_de_semaine_precedente", message)
    return affecter(
        depot,
        journal,
        semaine_id=semaine_id,
        gerant=avant.gerant,
        production=avant.production,
        auteur=auteur,
    )


def rotation(depot: DepotSemaines, annee: int, numero: int) -> dict[str, int | None]:
    """Rotation proposée (O9) : la personne suivante après la semaine précédente."""
    avant = depot.par_numero(*precedente(annee, numero))
    return {
        "gerant": proposer_rotation(
            depot.candidats("gerant"),
            avant.gerant if avant else None,
        ),
        "production": proposer_rotation(
            depot.candidats("production"),
            avant.production if avant else None,
        ),
    }


def _semaine(depot: DepotSemaines, semaine_id: int) -> EtatSemaine:
    semaine = depot.obtenir(semaine_id)
    if semaine is None:
        message = "Semaine inconnue."
        raise RefusMetier("semaine_inconnue", message)
    return semaine
