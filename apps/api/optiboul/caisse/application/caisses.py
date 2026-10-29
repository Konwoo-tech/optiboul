"""Cas d'usage des caisses (US-040, US-042, US-043, CdC §5.2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.caisse.domain.caisses import RAISONS_OUVERTURE
from optiboul.caisse.domain.caisses import StatutCaisse
from optiboul.caisse.domain.caisses import creneau_de
from optiboul.caisse.domain.caisses import raison_de_ne_pas_ouvrir
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.planning import Creneau

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.planning import DepotPlanning
    from optiboul.core.application.semaines import DepotSemaines
    from optiboul.notifications.application.ports import Notificateur

OUVRENT_LA_CAISSE = frozenset({"caissier", "gerant"})


@dataclass(frozen=True)
class EtatCaisse:
    id: int
    semaine: int
    jour: date
    creneau: str
    caissiere: int
    fonds: int
    statut: StatutCaisse


class DepotCaisses(Protocol):
    def obtenir(self, caisse_id: int) -> EtatCaisse | None: ...

    def en_cours(self) -> EtatCaisse | None: ...

    def du_creneau(self, jour: date, creneau: str) -> EtatCaisse | None: ...

    def ouvrir(  # noqa: PLR0913
        self,
        *,
        semaine: int,
        jour: date,
        creneau: str,
        caissiere: int,
        planifiee: int | None,
        fonds: int,
        le: datetime,
    ) -> int: ...


@dataclass(frozen=True)
class Depots:
    caisses: DepotCaisses
    semaines: DepotSemaines
    planning: DepotPlanning
    journal: Journal
    notificateur: Notificateur


@dataclass(frozen=True)
class Prochaine:
    jour: date
    creneau: str
    planifiee: int | None


def prochaine(depots: Depots, maintenant: datetime) -> Prochaine:
    """Le créneau qui s'ouvrirait maintenant et la caissière que le planning y met."""
    jour, creneau = creneau_de(maintenant)
    semaine = depots.semaines.ouverte()
    planifiee = None
    if semaine is not None:
        planifiee = depots.planning.lire(semaine.id).get((jour, Creneau(creneau)))
    return Prochaine(jour, creneau, planifiee)


def ouvrir(
    depots: Depots,
    *,
    fonds: int,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatCaisse:
    """La caissière compte le fonds ; hors planning, le gérant est prévenu."""
    if auteur.profil not in OUVRENT_LA_CAISSE or auteur.utilisateur_id is None:
        message = "Seuls la caisse et le gérant ouvrent une caisse."
        raise RefusMetier("droit_insuffisant", message)
    jour, creneau = creneau_de(maintenant)
    semaine = depots.semaines.ouverte()
    du_creneau = depots.caisses.du_creneau(jour, creneau)
    raison = raison_de_ne_pas_ouvrir(
        semaine_ouverte=semaine is not None,
        caisse_en_cours=depots.caisses.en_cours() is not None,
        caisse_du_creneau=du_creneau.statut if du_creneau else None,
        fonds=fonds,
    )
    if raison is not None:
        raise RefusMetier(raison, RAISONS_OUVERTURE[raison])
    assert semaine is not None
    planifiee = depots.planning.lire(semaine.id).get((jour, Creneau(creneau)))
    caisse_id = depots.caisses.ouvrir(
        semaine=semaine.id,
        jour=jour,
        creneau=creneau,
        caissiere=auteur.utilisateur_id,
        planifiee=planifiee,
        fonds=fonds,
        le=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="caisse.ouverte",
            auteur=auteur,
            objet_type="caisse",
            objet_id=str(caisse_id),
            apres={"jour": jour.isoformat(), "creneau": creneau, "fonds": fonds},
        ),
    )
    if planifiee != auteur.utilisateur_id:
        _signaler_hors_planning(
            depots,
            gerant=semaine.gerant,
            caisse_id=caisse_id,
            planifiee=planifiee,
            auteur=auteur,
            creneau=creneau,
        )
    caisse = depots.caisses.obtenir(caisse_id)
    assert caisse is not None
    return caisse


def _signaler_hors_planning(  # noqa: PLR0913
    depots: Depots,
    *,
    gerant: int | None,
    caisse_id: int,
    planifiee: int | None,
    auteur: Auteur,
    creneau: str,
) -> None:
    depots.journal.enregistrer(
        Evenement(
            action="caisse.hors_planning",
            auteur=auteur,
            objet_type="caisse",
            objet_id=str(caisse_id),
            apres={"planifiee": planifiee, "ouverte_par": auteur.utilisateur_id},
        ),
    )
    if gerant is not None:
        prevue = (
            "aucune caissière n'était planifiée"
            if planifiee is None
            else ("ce n'était pas la caissière planifiée")
        )
        depots.notificateur.notifier(
            [gerant],
            genre="caisse.hors_planning",
            titre=f"Caisse de {creneau} ouverte par {auteur.nom}",
            message=f"La caisse a été ouverte hors planning : {prevue}.",
            lien="/comptoir/caisses",
        )
