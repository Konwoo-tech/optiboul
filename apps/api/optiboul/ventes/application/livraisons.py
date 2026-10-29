"""Cas d'usage des livraisons (US-051, CdC §5.3, O3, R21)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.caisse.domain.caisses import peut_saisir
from optiboul.clients.domain.clients import Sens
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.commandes import quantites_saisies
from optiboul.ventes.domain.livraisons import Ligne
from optiboul.ventes.domain.livraisons import lignes_facturees
from optiboul.ventes.domain.livraisons import montant_du

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.caisse.application.caisses import DepotCaisses
    from optiboul.caisse.application.caisses import EtatCaisse
    from optiboul.clients.application.comptes import Compte
    from optiboul.clients.application.comptes import Comptes
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal

    from .commandes import DepotCommandes

LIVRENT = frozenset({"caissier", "gerant"})
SEQUENCE_BONS = "bon_livraison"


@dataclass(frozen=True)
class EtatLivraison:
    id: int
    numero: int
    client: int
    caisse: int
    montant_du: int
    solde_avant: int
    solde_apres: int


class DepotLivraisons(Protocol):
    def creer(  # noqa: PLR0913
        self,
        *,
        numero: int,
        caisse: EtatCaisse,
        client: int,
        commande: int | None,
        lignes: list[Ligne],
        solde_avant: int,
        solde_apres: int,
        auteur: int,
        le: datetime,
    ) -> int: ...

    def obtenir(self, livraison_id: int) -> EtatLivraison | None: ...


class Numeros(Protocol):
    def prochain(self, nom: str) -> int:
        """Numéro suivant, dans la transaction : sans trou ni doublon."""
        ...


@dataclass(frozen=True)
class Depots:
    livraisons: DepotLivraisons
    commandes: DepotCommandes
    comptes: Comptes
    caisses: DepotCaisses
    numeros: Numeros
    journal: Journal


def caisse_de_saisie(depots: Depots, auteur: Auteur) -> EtatCaisse:
    """La caisse en cours, verrouillée : la fermeture attend la fin de la saisie."""
    if auteur.profil not in LIVRENT or auteur.utilisateur_id is None:
        message = "Seuls la caisse et le gérant livrent et encaissent."
        raise RefusMetier("droit_insuffisant", message)
    en_cours = depots.caisses.en_cours()
    caisse = depots.caisses.verrouiller(en_cours.id) if en_cours else None
    if caisse is None or not peut_saisir(caisse.statut):
        message = "Aucune caisse n'est ouverte : ouvrez d'abord la caisse."
        raise RefusMetier("aucune_caisse_ouverte", message)
    if auteur.profil == "caissier" and caisse.caissiere != auteur.utilisateur_id:
        message = "La caisse en cours est celle d'une autre caissière."
        raise RefusMetier("caisse_d_une_autre", message)
    return caisse


def compte_du_client(depots: Depots, client_id: int) -> Compte:
    compte = depots.comptes.verrouiller(client_id)
    if compte is None or not compte.actif:
        message = "Client inconnu ou désactivé."
        raise RefusMetier("client_inconnu", message)
    return compte


def livrer(  # noqa: PLR0913
    depots: Depots,
    *,
    client_id: int,
    quantites: dict[str, int],
    auteur: Auteur,
    maintenant: datetime,
    commande_id: int | None = None,
) -> EtatLivraison:
    """Montant dû selon le tarif du client, débité de son compte dans la transaction."""
    caisse = caisse_de_saisie(depots, auteur)
    compte = compte_du_client(depots, client_id)
    lignes = lignes_facturees(
        quantites_saisies(quantites),
        depots.comptes.prix(client_id),
    )
    du = montant_du(lignes)
    assert auteur.utilisateur_id is not None
    livraison_id = depots.livraisons.creer(
        numero=depots.numeros.prochain(SEQUENCE_BONS),
        caisse=caisse,
        client=client_id,
        commande=commande_id,
        lignes=lignes,
        solde_avant=compte.solde,
        solde_apres=compte.solde - du,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    if du > 0:
        depots.comptes.mouvement(
            client_id,
            semaine=caisse.semaine,
            sens=Sens.DEBIT,
            montant=du,
            source_type="livraison",
            source_id=livraison_id,
            auteur=auteur.utilisateur_id,
        )
    livraison = depots.livraisons.obtenir(livraison_id)
    assert livraison is not None
    depots.journal.enregistrer(
        Evenement(
            action="livraison.enregistree",
            auteur=auteur,
            objet_type="livraison",
            objet_id=str(livraison_id),
            apres={
                "numero": livraison.numero,
                "client": client_id,
                "caisse": caisse.id,
                "lignes": {ligne.code: ligne.quantite for ligne in lignes},
                "montant_du": du,
                "solde_avant": livraison.solde_avant,
                "solde_apres": livraison.solde_apres,
            },
        ),
    )
    return livraison


def livrer_comme_commande(
    depots: Depots,
    *,
    client_id: int,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatLivraison:
    """« Livrer comme commandé » en une touche (O3) : les quantités de la commande."""
    caisse = caisse_de_saisie(depots, auteur)
    commande = depots.commandes.du_client(
        client_id,
        Session(caisse.jour, caisse.creneau),
    )
    if commande is None:
        message = "Ce client n'a pas de commande pour cette session."
        raise RefusMetier("aucune_commande", message)
    return livrer(
        depots,
        client_id=client_id,
        quantites=commande.lignes,
        auteur=auteur,
        maintenant=maintenant,
        commande_id=commande.id,
    )


@dataclass(frozen=True)
class Proposition:
    """Ce que l'écran pré-remplit : la commande au tarif du client, le solde après."""

    client: int
    commande: int | None
    lignes: list[Ligne]
    montant_du: int
    solde: int
    solde_apres: int
    plafond: int


def proposition(depots: Depots, *, client_id: int, auteur: Auteur) -> Proposition:
    caisse = caisse_de_saisie(depots, auteur)
    compte = compte_du_client(depots, client_id)
    commande = depots.commandes.du_client(
        client_id,
        Session(caisse.jour, caisse.creneau),
    )
    prix = depots.comptes.prix(client_id)
    quantites = commande.lignes if commande else {}
    lignes = [
        Ligne(code, quantite, prix[code] or 0)
        for code, quantite in quantites.items()
        if prix.get(code) is not None
    ]
    du = montant_du(lignes)
    return Proposition(
        client=client_id,
        commande=commande.id if commande else None,
        lignes=lignes,
        montant_du=du,
        solde=compte.solde,
        solde_apres=compte.solde - du,
        plafond=compte.plafond,
    )
