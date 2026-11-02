"""Comptes clients en base (adaptateur du port `Comptes`)."""

from __future__ import annotations

from django.db.models import F
from django.db.models import Sum
from django.db.models import Value
from django.db.models.functions import Coalesce

from optiboul.clients.application.comptes import Compte
from optiboul.clients.domain.clients import Sens
from optiboul.clients.domain.clients import plafond_du_client
from optiboul.clients.domain.clients import prix_du_client
from optiboul.core.infrastructure.parametres import parametre
from optiboul.production.infrastructure.models import Produit

from .models import Client
from .models import MouvementCompte
from .models import TarifClient

SOLDE = Coalesce(Sum(F("mouvements__sens") * F("mouvements__montant")), Value(0))


def solde_de(client_id: int) -> int:
    resultat = MouvementCompte.objects.filter(client_id=client_id).aggregate(
        solde=Coalesce(Sum(F("sens") * F("montant")), Value(0)),
    )
    return int(resultat["solde"])


class ComptesDjango:
    def verrouiller(self, client_id: int) -> Compte | None:
        client = Client.objects.select_for_update().filter(pk=client_id).first()
        if client is None:
            return None
        return Compte(
            client=client.pk,
            nom=client.nom,
            actif=client.actif,
            plafond=plafond_du_client(
                client.plafond,
                parametre("plafond_dette_client"),
            ),
            solde=solde_de(client.pk),
        )

    def prix(self, client_id: int) -> dict[str, int | None]:
        tarifs = dict(
            TarifClient.objects.filter(client_id=client_id).values_list(
                "produit_id",
                "prix",
            ),
        )
        return {
            produit.code: prix_du_client(tarifs.get(produit.pk), produit.prix)
            for produit in Produit.objects.filter(actif=True)
        }

    def mouvement(  # noqa: PLR0913
        self,
        client_id: int,
        *,
        semaine: int,
        sens: Sens,
        montant: int,
        source_type: str,
        source_id: int,
        auteur: int,
    ) -> None:
        MouvementCompte.objects.create(
            client_id=client_id,
            semaine_id=semaine,
            sens=sens,
            montant=montant,
            source_type=source_type,
            source_id=source_id,
            auteur_id=auteur,
        )


comptes = ComptesDjango()
