"""Cas d'usage des semaines (US-030 à US-035, CdC §5.1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.semaines import RAISONS_OUVERTURE
from optiboul.core.domain.semaines import Bornes
from optiboul.core.domain.semaines import Statut
from optiboul.core.domain.semaines import bornes
from optiboul.core.domain.semaines import code
from optiboul.core.domain.semaines import conflits_affectation
from optiboul.core.domain.semaines import precedente
from optiboul.core.domain.semaines import proposer_rotation
from optiboul.core.domain.semaines import raisons_de_ne_pas_ouvrir
from optiboul.core.domain.semaines import semaine_de

from .journal import Evenement

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.notifications.application.ports import Notificateur

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

    def ouverte(self) -> EtatSemaine | None: ...

    def ouvrir(self, semaine_id: int, par: int | None, le: datetime) -> None: ...

    def cloturer(self, semaine_id: int, par: int | None, le: datetime) -> None: ...

    def marquer_forcee(self, semaine_id: int, motif: str) -> None: ...


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
    semaine = obtenir_semaine(depot, semaine_id)
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
    apres = obtenir_semaine(depot, semaine_id)
    return apres, _conflits(depot, apres)


def copier_precedente(
    depot: DepotSemaines,
    journal: Journal,
    *,
    semaine_id: int,
    auteur: Auteur,
) -> tuple[EtatSemaine, list[str]]:
    """« Copier la semaine précédente » (O9) : mêmes affectations."""
    semaine = obtenir_semaine(depot, semaine_id)
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


def obtenir_semaine(depot: DepotSemaines, semaine_id: int) -> EtatSemaine:
    semaine = depot.obtenir(semaine_id)
    if semaine is None:
        message = "Semaine inconnue."
        raise RefusMetier("semaine_inconnue", message)
    return semaine


ALERTE_OUVERTURE = "semaine.ouverture_impossible"


def raisons_ouverture(depot: DepotSemaines, semaine: EtatSemaine) -> list[str]:
    avant = depot.par_numero(*precedente(semaine.annee, semaine.numero))
    ouverte = depot.ouverte()
    return raisons_de_ne_pas_ouvrir(
        statut=semaine.statut,
        gerant=semaine.gerant,
        production=semaine.production,
        precedente=avant.statut if avant else None,
        autre_ouverte=ouverte is not None and ouverte.id != semaine.id,
    )


def peut_ouvrir_ou_cloturer(semaine: EtatSemaine, auteur: Auteur) -> bool:
    """Le propriétaire, ou le gérant affecté à la semaine (CdC §3.3)."""
    if auteur.profil == "proprietaire":
        return True
    return auteur.profil == "gerant" and auteur.utilisateur_id == semaine.gerant


def ouvrir(
    depot: DepotSemaines,
    journal: Journal,
    *,
    semaine_id: int,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatSemaine:
    semaine = obtenir_semaine(depot, semaine_id)
    if auteur.utilisateur_id is not None and not peut_ouvrir_ou_cloturer(
        semaine,
        auteur,
    ):
        message = "Seuls le propriétaire et le gérant de la semaine l'ouvrent."
        raise RefusMetier("droit_insuffisant", message)
    if raisons := raisons_ouverture(depot, semaine):
        message = " ".join(RAISONS_OUVERTURE[r] for r in raisons)
        raise RefusMetier("ouverture_impossible", message, raisons=raisons)
    depot.ouvrir(semaine.id, auteur.utilisateur_id, maintenant)
    journal.enregistrer(
        Evenement(
            action="semaine.ouverte",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine.id),
            avant={"statut": semaine.statut},
            apres={"statut": Statut.OUVERTE},
        ),
    )
    return obtenir_semaine(depot, semaine.id)


def ouvrir_automatiquement(
    depot: DepotSemaines,
    journal: Journal,
    notificateur: Notificateur,
    *,
    maintenant: datetime,
    systeme: Auteur,
) -> EtatSemaine | None:
    """Lundi 06:00 (O8) : ouvre si tout est prêt, sinon alerte le propriétaire."""
    annee, numero = semaine_de(maintenant)
    semaine = depot.par_numero(annee, numero)
    if semaine is not None and semaine.statut is Statut.OUVERTE:
        return semaine
    if semaine is None:
        raisons, detail = ["non_planifiee"], "La semaine n'est pas planifiée."
    else:
        try:
            return ouvrir(
                depot,
                journal,
                semaine_id=semaine.id,
                auteur=systeme,
                maintenant=maintenant,
            )
        except RefusMetier as refus:
            raisons, detail = list(refus.autres.get("raisons", [])), refus.detail
    notificateur.notifier_profils(
        ["proprietaire"],
        genre=ALERTE_OUVERTURE,
        titre=f"La semaine {code(numero)} ne s'est pas ouverte",
        message=detail,
        lien="/gestion/semaines",
    )
    journal.enregistrer(
        Evenement(
            action=ALERTE_OUVERTURE,
            auteur=systeme,
            objet_type="semaine",
            objet_id=str(semaine.id) if semaine else "",
            apres={"annee": annee, "numero": numero, "raisons": raisons},
        ),
    )
    return None
