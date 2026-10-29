"""Cas d'usage des commandes (US-050, CdC §5.3, O3, R1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.caisse.domain.caisses import StatutCaisse
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.domain.commandes import heure_limite
from optiboul.ventes.domain.commandes import quantites_saisies
from optiboul.ventes.domain.commandes import sacs_a_petrir

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.caisse.application.caisses import DepotCaisses
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.semaines import DepotSemaines
    from optiboul.ventes.domain.commandes import Limites
    from optiboul.ventes.domain.commandes import Session

SAISISSENT_LES_COMMANDES = frozenset({"caissier", "gerant"})


@dataclass(frozen=True)
class EtatCommande:
    id: int
    client: int
    session: Session
    lignes: dict[str, int]  # code du produit → pains


class DepotCommandes(Protocol):
    def obtenir(self, commande_id: int) -> EtatCommande | None: ...

    def du_client(self, client_id: int, session: Session) -> EtatCommande | None: ...

    def de_la_session(self, session: Session) -> list[EtatCommande]: ...

    def enregistrer(  # noqa: PLR0913
        self,
        *,
        semaine: int,
        client: int,
        session: Session,
        lignes: dict[str, int],
        apres_heure_limite: bool,
        auteur: int,
        le: datetime,
    ) -> int:
        """Crée la commande du client pour la session, ou remplace ses lignes."""
        ...

    def supprimer(self, commande_id: int) -> None: ...


class Catalogue(Protocol):
    def pains_par_sac(self) -> dict[str, int]:
        """Produits actifs : code → pains par sac de la fiche en cours."""
        ...

    def clients_actifs(self, ids: set[int]) -> set[int]: ...


@dataclass(frozen=True)
class Depots:
    commandes: DepotCommandes
    catalogue: Catalogue
    semaines: DepotSemaines
    caisses: DepotCaisses
    journal: Journal


def _verifier_droit(auteur: Auteur) -> int:
    if auteur.profil not in SAISISSENT_LES_COMMANDES or auteur.utilisateur_id is None:
        message = "Seuls la caisse et le gérant saisissent les commandes."
        raise RefusMetier("droit_insuffisant", message)
    return auteur.utilisateur_id


def _verifier_session_ouverte(depots: Depots, session: Session) -> int:
    """Rattachée à la semaine ouverte (R1), tant que la caisse de la session vit."""
    semaine = depots.semaines.ouverte()
    if semaine is None:
        message = "Aucune semaine n'est ouverte (R1)."
        raise RefusMetier("semaine_non_ouverte", message)
    caisse = depots.caisses.du_creneau(session.jour, session.creneau)
    if caisse is not None and caisse.statut is StatutCaisse.FERMEE:
        message = "La caisse de cette session est fermée : plus de commande."
        raise RefusMetier("session_fermee", message)
    return semaine.id


def _trace(session: Session, lignes: dict[str, int] | None) -> dict[str, object] | None:
    if lignes is None:
        return None
    return {"jour": session.jour.isoformat(), "creneau": session.creneau, **lignes}


def saisir(  # noqa: PLR0913
    depots: Depots,
    *,
    client_id: int,
    session: Session,
    lignes: dict[str, int],
    auteur: Auteur,
    maintenant: datetime,
    limites: Limites,
) -> tuple[EtatCommande, bool]:
    """Une commande par client et par session ; la ressaisir remplace ses lignes."""
    par = _verifier_droit(auteur)
    semaine = _verifier_session_ouverte(depots, session)
    if client_id not in depots.catalogue.clients_actifs({client_id}):
        message = "Client inconnu ou désactivé."
        raise RefusMetier("client_inconnu", message)
    saisies = quantites_saisies(lignes)
    if inconnus := sorted(set(saisies) - set(depots.catalogue.pains_par_sac())):
        message = f"Produits inconnus ou inactifs : {', '.join(inconnus)}."
        raise RefusMetier("produit_inconnu", message, produits=inconnus)
    avant = depots.commandes.du_client(client_id, session)
    commande_id = depots.commandes.enregistrer(
        semaine=semaine,
        client=client_id,
        session=session,
        lignes=saisies,
        apres_heure_limite=maintenant > heure_limite(session, limites),
        auteur=par,
        le=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="commande.saisie" if avant is None else "commande.modifiee",
            auteur=auteur,
            objet_type="commande",
            objet_id=str(commande_id),
            avant=_trace(session, avant.lignes if avant else None),
            apres=_trace(session, saisies),
        ),
    )
    commande = depots.commandes.obtenir(commande_id)
    assert commande is not None
    return commande, avant is None


def annuler(depots: Depots, *, commande_id: int, auteur: Auteur) -> None:
    _verifier_droit(auteur)
    commande = depots.commandes.obtenir(commande_id)
    if commande is None:
        message = "Commande inconnue."
        raise RefusMetier("commande_inconnue", message)
    _verifier_session_ouverte(depots, commande.session)
    depots.commandes.supprimer(commande_id)
    depots.journal.enregistrer(
        Evenement(
            action="commande.annulee",
            auteur=auteur,
            objet_type="commande",
            objet_id=str(commande_id),
            avant=_trace(commande.session, commande.lignes),
        ),
    )


def reprendre_veille(
    depots: Depots,
    *,
    session: Session,
    auteur: Auteur,
    maintenant: datetime,
    limites: Limites,
) -> list[EtatCommande]:
    """Commandes du même créneau la veille, pour les clients qui n'ont pas commandé."""
    par = _verifier_droit(auteur)
    semaine = _verifier_session_ouverte(depots, session)
    veille = depots.commandes.de_la_session(session.veille())
    deja = {c.client for c in depots.commandes.de_la_session(session)}
    actifs = depots.catalogue.clients_actifs({c.client for c in veille})
    produits = depots.catalogue.pains_par_sac()
    reprises = []
    for commande in veille:
        lignes = {code: q for code, q in commande.lignes.items() if code in produits}
        if commande.client in deja or commande.client not in actifs or not lignes:
            continue
        commande_id = depots.commandes.enregistrer(
            semaine=semaine,
            client=commande.client,
            session=session,
            lignes=lignes,
            apres_heure_limite=maintenant > heure_limite(session, limites),
            auteur=par,
            le=maintenant,
        )
        reprise = depots.commandes.obtenir(commande_id)
        assert reprise is not None
        reprises.append(reprise)
    depots.journal.enregistrer(
        Evenement(
            action="commandes.reprises",
            auteur=auteur,
            objet_type="session",
            objet_id=f"{session.jour.isoformat()}-{session.creneau}",
            apres={"reprises": len(reprises), "de": session.veille().jour.isoformat()},
        ),
    )
    return reprises


@dataclass(frozen=True)
class Sacs:
    pains: int
    pains_par_sac: int
    sacs: int


def sacs(depots: Depots, session: Session) -> dict[str, Sacs]:
    """Pains commandés et sacs à pétrir par produit, recalculés à chaque commande."""
    pains = dict.fromkeys(depots.catalogue.pains_par_sac(), 0)
    for commande in depots.commandes.de_la_session(session):
        for code, quantite in commande.lignes.items():
            if code in pains:
                pains[code] += quantite
    par_sac = depots.catalogue.pains_par_sac()
    return {
        code: Sacs(total, par_sac[code], sacs_a_petrir(total, par_sac[code]))
        for code, total in pains.items()
    }
