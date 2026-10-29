"""Commandes en base (adaptateurs des ports `DepotCommandes` et `Catalogue`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import OuterRef
from django.db.models import Subquery

from optiboul.caisse.infrastructure.caisses import depot_caisses
from optiboul.clients.infrastructure.models import Client
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.production.infrastructure.models import FicheTechnique
from optiboul.production.infrastructure.models import Produit
from optiboul.ventes.application.commandes import Depots
from optiboul.ventes.application.commandes import EtatCommande
from optiboul.ventes.domain.commandes import Limites
from optiboul.ventes.domain.commandes import Session

from .models import Commande
from .models import LigneCommande

if TYPE_CHECKING:
    from datetime import datetime


def etat(commande: Commande) -> EtatCommande:
    return EtatCommande(
        id=commande.pk,
        client=commande.client_id,
        session=Session(commande.jour, commande.creneau),
        lignes={ligne.produit.code: ligne.quantite for ligne in commande.lignes.all()},
    )


def _commandes():
    return Commande.objects.prefetch_related("lignes__produit")


class DepotCommandesDjango:
    def obtenir(self, commande_id: int) -> EtatCommande | None:
        commande = _commandes().filter(pk=commande_id).first()
        return etat(commande) if commande else None

    def du_client(self, client_id: int, session: Session) -> EtatCommande | None:
        commande = (
            _commandes()
            .filter(client_id=client_id, jour=session.jour, creneau=session.creneau)
            .first()
        )
        return etat(commande) if commande else None

    def de_la_session(self, session: Session) -> list[EtatCommande]:
        commandes = _commandes().filter(jour=session.jour, creneau=session.creneau)
        return [etat(commande) for commande in commandes]

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
        commande, cree = Commande.objects.select_for_update().get_or_create(
            client_id=client,
            jour=session.jour,
            creneau=session.creneau,
            defaults={
                "semaine_id": semaine,
                "saisie_par_id": auteur,
                "saisie_le": le,
                "modifiee_le": le,
                "apres_heure_limite": apres_heure_limite,
            },
        )
        if not cree:
            commande.modifiee_le = le
            commande.apres_heure_limite = apres_heure_limite
            commande.save(update_fields=["modifiee_le", "apres_heure_limite"])
            commande.lignes.all().delete()
        produits = dict(
            Produit.objects.filter(code__in=lignes).values_list("code", "pk"),
        )
        LigneCommande.objects.bulk_create(
            LigneCommande(
                commande=commande,
                produit_id=produits[code],
                quantite=quantite,
            )
            for code, quantite in lignes.items()
        )
        return commande.pk

    def supprimer(self, commande_id: int) -> None:
        Commande.objects.filter(pk=commande_id).delete()


class CatalogueDjango:
    def pains_par_sac(self) -> dict[str, int]:
        en_cours = FicheTechnique.objects.filter(produit=OuterRef("pk")).order_by(
            "-version",
        )
        produits = (
            Produit.objects.filter(actif=True)
            .annotate(par_sac=Subquery(en_cours.values("pains_par_sac")[:1]))
            .exclude(par_sac=None)
            .order_by("ordre", "code")
        )
        return {produit.code: produit.par_sac for produit in produits}

    def clients_actifs(self, ids: set[int]) -> set[int]:
        return set(
            Client.objects.filter(pk__in=ids, actif=True).values_list("pk", flat=True),
        )


def limites() -> Limites:
    return Limites.depuis(
        parametre("heure_limite_commandes_jour"),
        parametre("heure_limite_commandes_nuit"),
    )


depot_commandes = DepotCommandesDjango()
catalogue = CatalogueDjango()

depots = Depots(
    commandes=depot_commandes,
    catalogue=catalogue,
    semaines=depot_semaines,
    caisses=depot_caisses,
    journal=journal,
)
