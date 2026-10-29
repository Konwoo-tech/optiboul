"""Cas d'usage des caisses (US-040, US-042, US-043, CdC §5.2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.caisse.domain.caisses import RAISONS_OUVERTURE
from optiboul.caisse.domain.caisses import GenreMouvement
from optiboul.caisse.domain.caisses import StatutCaisse
from optiboul.caisse.domain.caisses import creneau_de
from optiboul.caisse.domain.caisses import peut_saisir
from optiboul.caisse.domain.caisses import raison_de_ne_pas_ouvrir
from optiboul.caisse.domain.caisses import totaux
from optiboul.caisse.domain.regles import ResultatFermeture
from optiboul.caisse.domain.regles import attendu_en_caisse
from optiboul.caisse.domain.regles import ecart_caisse
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.planning import Creneau
from optiboul.core.domain.semaines import Statut as StatutSemaine

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

    def verrouiller(self, caisse_id: int) -> EtatCaisse | None:
        """Relit la caisse en la verrouillant jusqu'à la fin de la transaction."""
        ...

    def mouvements(self, caisse_id: int) -> list[tuple[GenreMouvement, int]]: ...

    def ajouter_mouvement(  # noqa: PLR0913
        self,
        caisse_id: int,
        *,
        genre: GenreMouvement,
        montant: int,
        auteur: int,
        libelle: str,
        receveur: int | None,
    ) -> None: ...

    def fermer(
        self,
        caisse_id: int,
        resultat: ResultatFermeture,
        le: datetime,
    ) -> None: ...

    def fermeture(self, caisse_id: int) -> dict[str, int | None]: ...

    def rouvrir(self, caisse_id: int) -> None: ...


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


def _caisse(depots: Depots, caisse_id: int, *, verrou: bool = False) -> EtatCaisse:
    caisse = (
        depots.caisses.verrouiller(caisse_id)
        if verrou
        else depots.caisses.obtenir(caisse_id)
    )
    if caisse is None:
        message = "Caisse inconnue."
        raise RefusMetier("caisse_inconnue", message)
    return caisse


@dataclass(frozen=True)
class Especes:
    fonds: int
    especes: int
    depenses: int
    remises: int
    attendu: int


def especes(depots: Depots, caisse_id: int) -> Especes:
    """Détail des espèces : ce que la fermeture et la remise au coffre affichent."""
    caisse = _caisse(depots, caisse_id)
    sommes = totaux(depots.caisses.mouvements(caisse_id))
    return Especes(
        fonds=caisse.fonds,
        especes=sommes[GenreMouvement.ESPECES],
        depenses=sommes[GenreMouvement.DEPENSE],
        remises=sommes[GenreMouvement.REMISE],
        attendu=attendu_en_caisse(
            caisse.fonds,
            sommes[GenreMouvement.ESPECES],
            sommes[GenreMouvement.DEPENSE],
            sommes[GenreMouvement.REMISE],
        ),
    )


def enregistrer_mouvement(  # noqa: PLR0913
    depots: Depots,
    *,
    caisse_id: int,
    genre: GenreMouvement,
    montant: int,
    auteur: Auteur,
    libelle: str = "",
    receveur: int | None = None,
) -> None:
    """Pour les encaissements, dépenses et remises : refusé sur une caisse fermée."""
    caisse = _caisse(depots, caisse_id, verrou=True)
    if not peut_saisir(caisse.statut):
        message = "La caisse est fermée : plus aucune saisie n'est possible."
        raise RefusMetier("caisse_fermee", message)
    if montant <= 0:
        message = "Le montant doit être positif."
        raise RefusMetier("montant_invalide", message)
    assert auteur.utilisateur_id is not None
    depots.caisses.ajouter_mouvement(
        caisse_id,
        genre=genre,
        montant=montant,
        auteur=auteur.utilisateur_id,
        libelle=libelle,
        receveur=receveur,
    )


def fermer(
    depots: Depots,
    *,
    caisse_id: int,
    compte: int,
    auteur: Auteur,
    maintenant: datetime,
) -> ResultatFermeture:
    """Un seul comptage (O2, R17) : écart = compté moins attendu ; puis verrouillage."""
    caisse = _caisse(depots, caisse_id, verrou=True)
    sienne = auteur.profil == "caissier" and auteur.utilisateur_id == caisse.caissiere
    if not (sienne or auteur.profil == "gerant"):
        message = "Seuls la caissière de cette caisse et le gérant la ferment."
        raise RefusMetier("droit_insuffisant", message)
    if not peut_saisir(caisse.statut):
        message = "Cette caisse est déjà fermée."
        raise RefusMetier("caisse_fermee", message)
    detail = especes(depots, caisse_id)
    resultat = ecart_caisse(
        detail.fonds,
        detail.especes,
        detail.depenses,
        detail.remises,
        compte,
    )
    depots.caisses.fermer(caisse_id, resultat, maintenant)
    depots.journal.enregistrer(
        Evenement(
            action="caisse.fermee",
            auteur=auteur,
            objet_type="caisse",
            objet_id=str(caisse_id),
            avant={"statut": caisse.statut},
            apres={
                "statut": StatutCaisse.FERMEE,
                "attendu": resultat.attendu,
                "compte": resultat.compte,
                "ecart": resultat.ecart,
                "resultat": resultat.statut,
            },
        ),
    )
    return resultat


ROUVRENT_LA_CAISSE = frozenset({"gerant", "proprietaire"})


def rouvrir(
    depots: Depots,
    *,
    caisse_id: int,
    motif: str,
    auteur: Auteur,
) -> EtatCaisse:
    """R13 : gérant ou propriétaire, motif obligatoire, tracé ; propriétaire informé."""
    if auteur.profil not in ROUVRENT_LA_CAISSE:
        message = "Seuls le gérant et le propriétaire rouvrent une caisse (R13)."
        raise RefusMetier("droit_insuffisant", message)
    if not motif.strip():
        message = "Le motif de la réouverture est obligatoire."
        raise RefusMetier("motif_obligatoire", message)
    caisse = _caisse(depots, caisse_id, verrou=True)
    if caisse.statut is not StatutCaisse.FERMEE:
        message = "Seule une caisse fermée peut être rouverte."
        raise RefusMetier("caisse_non_fermee", message)
    semaine = depots.semaines.obtenir(caisse.semaine)
    if semaine is None or semaine.statut is not StatutSemaine.OUVERTE:
        message = "La semaine de cette caisse n'est plus ouverte."
        raise RefusMetier("semaine_non_ouverte", message)
    if depots.caisses.en_cours() is not None:
        message = "Une autre caisse est en cours : fermez-la d'abord."
        raise RefusMetier("caisse_deja_ouverte", message)
    avant = depots.caisses.fermeture(caisse_id)
    depots.caisses.rouvrir(caisse_id)
    depots.journal.enregistrer(
        Evenement(
            action="caisse.rouverte",
            auteur=auteur,
            objet_type="caisse",
            objet_id=str(caisse_id),
            avant={"statut": StatutCaisse.FERMEE, **avant},
            apres={"statut": StatutCaisse.ROUVERTE, "motif": motif.strip()},
        ),
    )
    depots.notificateur.notifier_profils(
        ["proprietaire"],
        genre="caisse.rouverte",
        titre=(
            f"Caisse de {caisse.creneau} du {caisse.jour:%d/%m} "
            f"rouverte par {auteur.nom}"
        ),
        message=f"Motif : {motif.strip()}",
        lien="/comptoir/caisses",
    )
    return _caisse(depots, caisse_id)
