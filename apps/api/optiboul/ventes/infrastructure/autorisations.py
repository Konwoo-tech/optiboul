"""Livraison au-delà du plafond (R6) : un type de demande du circuit commun (US-053).

Émise par la caisse ou le gérant, validée par le gérant ou le propriétaire, liée à la
livraison en attente ; l'accord la livre et débite le compte, le refus l'annule.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.clients.domain.clients import plafond_du_client
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.parametres import parametre
from optiboul.demandes.application import demandes as circuit
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.ventes.domain.livraisons import StatutLivraison

from .models import Livraison

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.core.application.journal import Auteur
    from optiboul.demandes.application.demandes import EtatDemande

PLAFOND = "plafond"


def _preparer(livraison_id: int, auteur: Auteur) -> ObjetLie:
    livraison = (
        Livraison.objects.select_related("client").filter(pk=livraison_id).first()
    )
    if livraison is None or livraison.statut != StatutLivraison.EN_ATTENTE:
        message = "Aucune livraison en attente d'accord."
        raise RefusMetier("objet_inconnu", message)
    client = livraison.client
    return ObjetLie(
        f"{livraison.client.nom} · bon n° {livraison.numero} · "
        f"{livraison.montant_du} FCFA",
        {
            "client": livraison.client_id,
            "client_nom": livraison.client.nom,
            "numero": livraison.numero,
            "montant_du": livraison.montant_du,
            "solde_avant": livraison.solde_avant,
            "solde_apres": livraison.solde_apres,
            "plafond": plafond_du_client(
                client.plafond,
                parametre("plafond_dette_client"),
            ),
        },
    )


def _conclure(demande: EtatDemande, decideur: Auteur, *, accord: bool) -> None:
    from optiboul.ventes.application.livraisons import conclure_autorisation  # noqa: PLC0415

    from .livraisons import depots  # noqa: PLC0415

    conclure_autorisation(
        depots,
        livraison_id=demande.objet_id,
        accord=accord,
        decideur=decideur,
    )


TYPE_PLAFOND = TypeDemande(
    cle=PLAFOND,
    libelle="Livraison au-delà du plafond",
    objet_type="livraison",
    emetteurs=frozenset({"caissier", "gerant"}),
    valideurs=lambda profil: ("gerant", "proprietaire"),
    preparer=_preparer,
    sur_accord=lambda demande, qui: _conclure(demande, qui, accord=True),
    sur_refus=lambda demande, qui: _conclure(demande, qui, accord=False),
    lien="/comptoir/demandes",
)


class AutorisationsDjango:
    def demander(
        self,
        livraison_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        from optiboul.demandes.infrastructure.demandes import depots  # noqa: PLC0415

        demande = circuit.emettre(
            depots,
            type_cle=PLAFOND,
            objet_id=livraison_id,
            motif=motif,
            auteur=auteur,
            maintenant=maintenant,
        )
        return demande.code


autorisations = AutorisationsDjango()


def enregistrer() -> None:
    circuit.enregistrer_type(TYPE_PLAFOND)
