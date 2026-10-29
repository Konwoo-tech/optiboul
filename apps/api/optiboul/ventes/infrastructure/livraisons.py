"""Livraisons en base (adaptateur du port `DepotLivraisons`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import Sum

from optiboul.caisse.infrastructure.caisses import depot_caisses
from optiboul.clients.infrastructure.comptes import comptes
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import numeros
from optiboul.production.infrastructure.models import Produit
from optiboul.ventes.application.livraisons import Depots
from optiboul.ventes.application.livraisons import EtatLivraison
from optiboul.ventes.domain.livraisons import StatutLivraison
from optiboul.ventes.domain.livraisons import montant_du
from optiboul.ventes.domain.mouvements import GenreMouvementInterne

from .autorisations import autorisations
from .commandes import depot_commandes
from .models import Encaissement
from .models import LigneLivraison
from .models import Livraison
from .models import MouvementInterne as MouvementInterneModele

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.caisse.application.caisses import EtatCaisse
    from optiboul.ventes.domain.encaissements import Paiement
    from optiboul.ventes.domain.livraisons import Ligne
    from optiboul.ventes.domain.mouvements import MouvementInterne


def etat(livraison: Livraison) -> EtatLivraison:
    return EtatLivraison(
        id=livraison.pk,
        numero=livraison.numero,
        client=livraison.client_id,
        caisse=livraison.caisse_id,
        montant_du=livraison.montant_du,
        recu=livraison.encaissements.aggregate(recu=Sum("montant"))["recu"] or 0,
        solde_avant=livraison.solde_avant,
        solde_apres=livraison.solde_apres,
        statut=StatutLivraison(livraison.statut),
        semaine=livraison.semaine_id,
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
        statut: StatutLivraison,
        auteur: int,
        le: datetime,
    ) -> int:
        livraison = Livraison.objects.create(
            statut=statut,
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

    def verrouiller(self, livraison_id: int) -> EtatLivraison | None:
        livraison = (
            Livraison.objects.select_for_update().filter(pk=livraison_id).first()
        )
        return etat(livraison) if livraison else None

    def conclure(
        self,
        livraison_id: int,
        *,
        statut: StatutLivraison,
        decideur: str,
        solde_avant: int,
        solde_apres: int,
    ) -> None:
        Livraison.objects.filter(pk=livraison_id).update(
            statut=statut,
            autorisee_par=decideur,
            solde_avant=solde_avant,
            solde_apres=solde_apres,
        )


class DepotEncaissementsDjango:
    def creer(  # noqa: PLR0913
        self,
        *,
        caisse: EtatCaisse,
        client: int,
        livraison: int | None,
        paiement: Paiement,
        auteur: int,
        le: datetime,
    ) -> int:
        return Encaissement.objects.create(
            semaine_id=caisse.semaine,
            caisse_id=caisse.id,
            client_id=client,
            livraison_id=livraison,
            mode=paiement.mode,
            montant=paiement.montant,
            reference=paiement.reference,
            cree_par_id=auteur,
            cree_le=le,
        ).pk


depot_livraisons = DepotLivraisonsDjango()
depot_encaissements = DepotEncaissementsDjango()

depots = Depots(
    livraisons=depot_livraisons,
    encaissements=depot_encaissements,
    commandes=depot_commandes,
    comptes=comptes,
    caisses=depot_caisses,
    numeros=numeros,
    journal=journal,
    autorisations=autorisations,
)


class DepotMouvementsInternesDjango:
    def creer(
        self,
        *,
        caisse: EtatCaisse,
        mouvement: MouvementInterne,
        auteur: int,
        le: datetime,
    ) -> int:
        return MouvementInterneModele.objects.create(
            semaine_id=caisse.semaine,
            caisse_id=caisse.id,
            genre=mouvement.genre,
            produit=Produit.objects.get(code=mouvement.produit),
            quantite=mouvement.quantite,
            motif=mouvement.motif,
            cree_par_id=auteur,
            cree_le=le,
        ).pk

    def de_la_caisse(
        self,
        caisse_id: int,
    ) -> list[tuple[GenreMouvementInterne, str, int]]:
        lignes = MouvementInterneModele.objects.filter(caisse_id=caisse_id).values_list(
            "genre",
            "produit__code",
            "quantite",
        )
        return [(GenreMouvementInterne(g), code, q) for g, code, q in lignes]

    def produits_actifs(self) -> set[str]:
        return set(Produit.objects.filter(actif=True).values_list("code", flat=True))


depot_mouvements_internes = DepotMouvementsInternesDjango()
