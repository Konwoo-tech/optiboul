"""Livraisons et encaissements (US-051, US-052, CdC §5.3, R7, R21)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.caisse.domain.caisses import GenreMouvement
from optiboul.caisse.domain.caisses import peut_saisir
from optiboul.clients.domain.clients import Sens
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.commandes import quantites_saisies
from optiboul.ventes.domain.encaissements import ModePaiement
from optiboul.ventes.domain.encaissements import verifier_paiement
from optiboul.ventes.domain.livraisons import ACTIONS_AU_DELA_DU_PLAFOND
from optiboul.ventes.domain.livraisons import Ligne
from optiboul.ventes.domain.livraisons import StatutLivraison
from optiboul.ventes.domain.livraisons import lignes_facturees
from optiboul.ventes.domain.livraisons import montant_du
from optiboul.ventes.domain.regles import verifier_plafond

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.caisse.application.caisses import DepotCaisses
    from optiboul.caisse.application.caisses import EtatCaisse
    from optiboul.clients.application.comptes import Compte
    from optiboul.clients.application.comptes import Comptes
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.ventes.domain.encaissements import Paiement

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
    recu: int
    solde_avant: int
    solde_apres: int
    statut: StatutLivraison
    semaine: int


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
        statut: StatutLivraison,
        auteur: int,
        le: datetime,
    ) -> int: ...

    def obtenir(self, livraison_id: int) -> EtatLivraison | None: ...

    def verrouiller(self, livraison_id: int) -> EtatLivraison | None: ...

    def conclure(
        self,
        livraison_id: int,
        *,
        statut: StatutLivraison,
        decideur: str,
        solde_avant: int,
        solde_apres: int,
    ) -> None:
        """Livraison en attente accordée ou refusée."""
        ...


class Autorisations(Protocol):
    def demander(
        self,
        livraison_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        """Émet la demande « livraison au-delà du plafond » ; renvoie DEM-xxx."""
        ...


class DepotEncaissements(Protocol):
    def creer(  # noqa: PLR0913
        self,
        *,
        caisse: EtatCaisse,
        client: int,
        livraison: int | None,
        paiement: Paiement,
        auteur: int,
        le: datetime,
    ) -> int: ...


class Numeros(Protocol):
    def prochain(self, nom: str) -> int:
        """Numéro suivant, dans la transaction : sans trou ni doublon."""
        ...


@dataclass(frozen=True)
class Depots:
    livraisons: DepotLivraisons
    encaissements: DepotEncaissements
    commandes: DepotCommandes
    comptes: Comptes
    caisses: DepotCaisses
    numeros: Numeros
    journal: Journal
    autorisations: Autorisations


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


def _encaisser(  # noqa: PLR0913
    depots: Depots,
    *,
    caisse: EtatCaisse,
    client_id: int,
    paiement: Paiement,
    auteur: int,
    maintenant: datetime,
    livraison_id: int | None = None,
) -> int:
    """Crédite le compte du client ; les espèces entrent dans la caisse (R21)."""
    encaissement_id = depots.encaissements.creer(
        caisse=caisse,
        client=client_id,
        livraison=livraison_id,
        paiement=paiement,
        auteur=auteur,
        le=maintenant,
    )
    depots.comptes.mouvement(
        client_id,
        semaine=caisse.semaine,
        sens=Sens.CREDIT,
        montant=paiement.montant,
        source_type="encaissement",
        source_id=encaissement_id,
        auteur=auteur,
    )
    if paiement.mode is ModePaiement.ESPECES:
        depots.caisses.ajouter_mouvement(
            caisse.id,
            genre=GenreMouvement.ESPECES,
            montant=paiement.montant,
            auteur=auteur,
            libelle=f"Encaissement n° {encaissement_id}",
            receveur=None,
        )
    return encaissement_id


def _paiement(paiement: Paiement | None) -> Paiement | None:
    return verifier_paiement(paiement) if paiement and paiement.montant else None


def livrer(  # noqa: PLR0913
    depots: Depots,
    *,
    client_id: int,
    quantites: dict[str, int],
    auteur: Auteur,
    maintenant: datetime,
    commande_id: int | None = None,
    paiement: Paiement | None = None,
    demande_motif: str | None = None,
) -> EtatLivraison:
    """Débite le montant dû au tarif du client et crédite le paiement : partiel, ou
    au-delà pour rembourser une ancienne dette ; tout dans la même transaction.

    Au-delà du plafond (R6), la livraison est refusée avec le manque à encaisser ;
    avec un motif, elle attend l'accord du gérant et la caisse sert le client suivant.
    """
    caisse = caisse_de_saisie(depots, auteur)
    compte = compte_du_client(depots, client_id)
    lignes = lignes_facturees(
        quantites_saisies(quantites),
        depots.comptes.prix(client_id),
    )
    paye = _paiement(paiement)
    du = montant_du(lignes)
    recu = paye.montant if paye else 0
    plafond = verifier_plafond(compte.solde, du, recu, compte.plafond)
    if not plafond.autorise and demande_motif is None:
        message = (
            f"Plafond de dette dépassé : encaissez {plafond.manque} FCFA "
            "ou demandez l'accord du gérant."
        )
        raise RefusMetier(
            "plafond_depasse",
            message,
            manque=plafond.manque,
            solde_apres=compte.solde - du + recu,
            plafond=compte.plafond,
            actions=list(ACTIONS_AU_DELA_DU_PLAFOND),
        )
    statut = StatutLivraison.LIVREE if plafond.autorise else StatutLivraison.EN_ATTENTE
    assert auteur.utilisateur_id is not None
    livraison_id = depots.livraisons.creer(
        numero=depots.numeros.prochain(SEQUENCE_BONS),
        caisse=caisse,
        client=client_id,
        commande=commande_id,
        lignes=lignes,
        solde_avant=compte.solde,
        solde_apres=compte.solde - du + recu,
        statut=statut,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    demande = ""
    if statut is StatutLivraison.EN_ATTENTE:
        # Le compte n'est débité qu'à l'accord ; l'argent reçu est déjà encaissé.
        demande = depots.autorisations.demander(
            livraison_id,
            motif=demande_motif or "",
            auteur=auteur,
            maintenant=maintenant,
        )
    elif du > 0:
        depots.comptes.mouvement(
            client_id,
            semaine=caisse.semaine,
            sens=Sens.DEBIT,
            montant=du,
            source_type="livraison",
            source_id=livraison_id,
            auteur=auteur.utilisateur_id,
        )
    if paye is not None:
        _encaisser(
            depots,
            caisse=caisse,
            client_id=client_id,
            paiement=paye,
            auteur=auteur.utilisateur_id,
            maintenant=maintenant,
            livraison_id=livraison_id,
        )
    livraison = depots.livraisons.obtenir(livraison_id)
    assert livraison is not None
    depots.journal.enregistrer(
        Evenement(
            action="livraison.enregistree"
            if statut is StatutLivraison.LIVREE
            else "livraison.en_attente",
            auteur=auteur,
            objet_type="livraison",
            objet_id=str(livraison_id),
            apres={
                "numero": livraison.numero,
                "statut": statut,
                "demande": demande,
                "client": client_id,
                "caisse": caisse.id,
                "lignes": {ligne.code: ligne.quantite for ligne in lignes},
                "montant_du": du,
                "recu": recu,
                "mode": paye.mode if paye else None,
                "reference": paye.reference if paye else "",
                "solde_avant": livraison.solde_avant,
                "solde_apres": livraison.solde_apres,
            },
        ),
    )
    return livraison


@dataclass(frozen=True)
class EtatEncaissement:
    id: int
    client: int
    montant: int
    solde_avant: int
    solde_apres: int


def encaisser(
    depots: Depots,
    *,
    client_id: int,
    paiement: Paiement,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatEncaissement:
    """Paiement sans livraison : remboursement d'une ancienne dette, même partiel."""
    caisse = caisse_de_saisie(depots, auteur)
    compte = compte_du_client(depots, client_id)
    paye = verifier_paiement(paiement)
    assert auteur.utilisateur_id is not None
    encaissement_id = _encaisser(
        depots,
        caisse=caisse,
        client_id=client_id,
        paiement=paye,
        auteur=auteur.utilisateur_id,
        maintenant=maintenant,
    )
    etat = EtatEncaissement(
        id=encaissement_id,
        client=client_id,
        montant=paye.montant,
        solde_avant=compte.solde,
        solde_apres=compte.solde + paye.montant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="encaissement.enregistre",
            auteur=auteur,
            objet_type="encaissement",
            objet_id=str(encaissement_id),
            apres={
                "client": client_id,
                "caisse": caisse.id,
                "mode": paye.mode,
                "montant": paye.montant,
                "reference": paye.reference,
                "solde_avant": etat.solde_avant,
                "solde_apres": etat.solde_apres,
            },
        ),
    )
    return etat


def livrer_comme_commande(  # noqa: PLR0913
    depots: Depots,
    *,
    client_id: int,
    auteur: Auteur,
    maintenant: datetime,
    paiement: Paiement | None = None,
    demande_motif: str | None = None,
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
        paiement=paiement,
        demande_motif=demande_motif,
    )


def _livraison_en_attente(depots: Depots, livraison_id: int) -> EtatLivraison:
    livraison = depots.livraisons.verrouiller(livraison_id)
    if livraison is None or livraison.statut is not StatutLivraison.EN_ATTENTE:
        message = "Cette livraison n'attend plus d'accord."
        raise RefusMetier("livraison_non_en_attente", message)
    return livraison


def conclure_autorisation(
    depots: Depots,
    *,
    livraison_id: int,
    accord: bool,
    decideur: Auteur,
) -> None:
    """La demande de plafond tranchée : livrée et débitée, ou refusée (US-071)."""
    livraison = _livraison_en_attente(depots, livraison_id)
    compte = depots.comptes.verrouiller(livraison.client)
    assert compte is not None
    statut = StatutLivraison.LIVREE if accord else StatutLivraison.REFUSEE
    solde_apres = compte.solde - livraison.montant_du if accord else compte.solde
    if accord and livraison.montant_du > 0:
        assert decideur.utilisateur_id is not None
        depots.comptes.mouvement(
            livraison.client,
            semaine=livraison.semaine,
            sens=Sens.DEBIT,
            montant=livraison.montant_du,
            source_type="livraison",
            source_id=livraison.id,
            auteur=decideur.utilisateur_id,
        )
    depots.livraisons.conclure(
        livraison_id,
        statut=statut,
        decideur=decideur.nom,
        solde_avant=compte.solde,
        solde_apres=solde_apres,
    )
    depots.journal.enregistrer(
        Evenement(
            action=f"livraison.{'autorisee' if accord else 'refusee'}",
            auteur=decideur,
            objet_type="livraison",
            objet_id=str(livraison_id),
            avant={"statut": StatutLivraison.EN_ATTENTE},
            apres={
                "statut": statut,
                "solde_avant": compte.solde,
                "solde_apres": solde_apres,
            },
        ),
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
    manque: int  # à encaisser pour livrer sans accord (R6)


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
        manque=verifier_plafond(compte.solde, du, 0, compte.plafond).manque,
    )
