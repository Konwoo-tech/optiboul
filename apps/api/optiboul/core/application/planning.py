"""Cas d'usage du planning des caisses (US-031)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.planning import Affectations
from optiboul.core.domain.planning import Creneau
from optiboul.core.domain.planning import conflits
from optiboul.core.domain.planning import decaler
from optiboul.core.domain.planning import vides
from optiboul.core.domain.semaines import Statut
from optiboul.core.domain.semaines import bornes
from optiboul.core.domain.semaines import precedente

from .journal import Evenement

if TYPE_CHECKING:
    from datetime import date

    from .journal import Auteur
    from .journal import Journal
    from .semaines import DepotSemaines
    from .semaines import EtatSemaine


class DepotPlanning(Protocol):
    def lire(self, semaine_id: int) -> Affectations: ...

    def placer(
        self,
        semaine_id: int,
        jour: date,
        creneau: Creneau,
        caissiere: int | None,
    ) -> None: ...


@dataclass(frozen=True)
class EtatPlanning:
    affectations: Affectations
    vides: list[tuple[date, Creneau]]
    conflits: list[dict[str, object]]


def etat(depot: DepotPlanning, semaine: EtatSemaine) -> EtatPlanning:
    affectations = depot.lire(semaine.id)
    periode = bornes(semaine.annee, semaine.numero)
    return EtatPlanning(
        affectations,
        vides(periode, affectations),
        conflits(affectations),
    )


def peut_planifier(semaine: EtatSemaine, auteur: Auteur) -> bool:
    """Le propriétaire, ou le gérant affecté à cette semaine (CdC §3.3, §4.3)."""
    if auteur.profil == "proprietaire":
        return True
    return auteur.profil == "gerant" and auteur.utilisateur_id == semaine.gerant


def placer(  # noqa: PLR0913
    depot: DepotPlanning,
    semaines: DepotSemaines,
    journal: Journal,
    *,
    semaine: EtatSemaine,
    jour: date,
    creneau: Creneau,
    caissiere: int | None,
    auteur: Auteur,
) -> None:
    if not peut_planifier(semaine, auteur):
        message = "Seuls le propriétaire et le gérant de la semaine font le planning."
        raise RefusMetier("droit_insuffisant", message)
    if semaine.statut is Statut.CLOTUREE:
        message = "Le planning d'une semaine clôturée ne change plus."
        raise RefusMetier("semaine_cloturee", message)
    if jour not in bornes(semaine.annee, semaine.numero).jours:
        message = "Ce jour n'appartient pas à la semaine."
        raise RefusMetier("jour_hors_semaine", message)
    if caissiere is not None and semaines.profil(caissiere) != "caissier":
        message = "Cette personne n'a pas le profil caissier."
        raise RefusMetier("profil_inadapte", message, role="caissier")
    avant = depot.lire(semaine.id).get((jour, creneau))
    if avant == caissiere:
        return
    depot.placer(semaine.id, jour, creneau, caissiere)
    journal.enregistrer(
        Evenement(
            action="planning.creneau",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine.id),
            avant={"jour": jour.isoformat(), "creneau": creneau, "caissiere": avant},
            apres={
                "jour": jour.isoformat(),
                "creneau": creneau,
                "caissiere": caissiere,
            },
        ),
    )


def copier_precedent(
    depot: DepotPlanning,
    semaines: DepotSemaines,
    *,
    semaine: EtatSemaine,
) -> int:
    """Reprend le planning de la semaine précédente, décalé de 7 jours (O9)."""
    avant = semaines.par_numero(*precedente(semaine.annee, semaine.numero))
    if avant is None:
        return 0
    copie = decaler(depot.lire(avant.id), 7)
    for (jour, creneau), caissiere in copie.items():
        depot.placer(semaine.id, jour, creneau, caissiere)
    return len(copie)
