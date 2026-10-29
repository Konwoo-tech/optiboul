"""Livraisons en base (adaptateur du port `DepotLivraisons`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.caisse.infrastructure.caisses import depot_caisses
from optiboul.clients.infrastructure.comptes import comptes
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import prochain_numero
from optiboul.production.infrastructure.models import Produit
from optiboul.ventes.application.livraisons import Depots
from optiboul.ventes.application.livraisons import EtatLivraison
from optiboul.ventes.domain.livraisons import montant_du

from .commandes import depot_commandes
from .models import LigneLivraison
from .models import Livraison

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.caisse.application.caisses import EtatCaisse
    from optiboul.ventes.domain.livraisons import Ligne


def etat(livraison: Livraison) -> EtatLivraison:
    return EtatLivraison(
        id=livraison.pk,
        numero=livraison.numero,
        client=livraison.client_id,
        caisse=livraison.caisse_id,
        montant_du=livraison.montant_du,
        solde_avant=livraison.solde_avant,
        solde_apres=livraison.solde_apres,
    )


class DepotLivraisonsDjango:
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
    ) -> int:
        livraison = Livraison.objects.create(
            numero=numero,
            semaine_id=caisse.semaine,
            caisse_id=caisse.id,
            client_id=client,
            commande_id=commande,
            montant_du=montant_du(lignes),
            solde_avant=solde_avant,
            solde_apres=solde_apres,
            cree_par_id=auteur,
            cree_le=le,
        )
        produits = dict(
            Produit.objects.filter(
                code__in=[ligne.code for ligne in lignes],
            ).values_list(
                "code",
                "pk",
            ),
        )
        LigneLivraison.objects.bulk_create(
            LigneLivraison(
                livraison=livraison,
                produit_id=produits[ligne.code],
                quantite=ligne.quantite,
                prix_unitaire=ligne.prix_unitaire,
                montant=ligne.montant,
            )
            for ligne in lignes
        )
        return livraison.pk

    def obtenir(self, livraison_id: int) -> EtatLivraison | None:
        livraison = Livraison.objects.filter(pk=livraison_id).first()
        return etat(livraison) if livraison else None


class NumerosDjango:
    def prochain(self, nom: str) -> int:
        return prochain_numero(nom)


depot_livraisons = DepotLivraisonsDjango()
numeros = NumerosDjango()

depots = Depots(
    livraisons=depot_livraisons,
    commandes=depot_commandes,
    comptes=comptes,
    caisses=depot_caisses,
    numeros=numeros,
    journal=journal,
)
