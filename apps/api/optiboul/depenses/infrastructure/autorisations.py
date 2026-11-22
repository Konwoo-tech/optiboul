"""Dépense au-dessus du seuil (R8) : un type de demande du circuit commun (US-112)."""

from __future__ import annotations

from datetime import datetime
from datetime import time
from datetime import timedelta
from typing import TYPE_CHECKING

from optiboul.caisse.domain.caisses import FUSEAU
from optiboul.caisse.domain.caisses import creneau_de
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.demandes.application import demandes as circuit
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.depenses.application.depenses import valideurs
from optiboul.depenses.domain.depenses import numero_affiche

from .models import Depense

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur
    from optiboul.demandes.application.demandes import EtatDemande

DEPENSE = "depense"


def fin_de_session(instant: datetime) -> datetime:
    """Échéance « fin de session » (CdC §5.9) : 18:00 le jour, 06:00 après la nuit."""
    jour, creneau = creneau_de(instant)
    if creneau == "jour":
        return datetime.combine(jour, time(18), tzinfo=FUSEAU)
    return datetime.combine(jour + timedelta(days=1), time(6), tzinfo=FUSEAU)


def _preparer(depense_id: int, auteur: Auteur) -> ObjetLie:
    depense = Depense.objects.filter(pk=depense_id, statut="en_attente").first()
    if depense is None:
        message = "Aucune dépense en attente d'accord."
        raise RefusMetier("objet_inconnu", message)
    return ObjetLie(
        f"{numero_affiche(depense.numero)} · {depense.libelle} · "
        f"{depense.montant} FCFA",
        {
            "numero": numero_affiche(depense.numero),
            "categorie": depense.categorie,
            "montant": depense.montant,
            "paye_par": depense.paye_par,
            "rattachement": depense.rattachement,
        },
    )


def _conclure(demande: EtatDemande, decideur: Auteur, *, accord: bool) -> None:
    from optiboul.depenses.application.depenses import conclure  # noqa: PLC0415

    from .depenses import depots  # noqa: PLC0415

    conclure(depots, depense_id=demande.objet_id, accord=accord, decideur=decideur)


TYPE_DEPENSE = TypeDemande(
    cle=DEPENSE,
    libelle="Dépense au-dessus du seuil",
    objet_type="depense",
    emetteurs=frozenset({"caissier", "gerant", "production"}),
    valideurs=valideurs,
    preparer=_preparer,
    sur_accord=lambda demande, qui: _conclure(demande, qui, accord=True),
    sur_refus=lambda demande, qui: _conclure(demande, qui, accord=False),
    echeance=fin_de_session,
    lien="/gestion/depenses",
)


class AutorisationsDjango:
    def demander(
        self,
        depense_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        from optiboul.demandes.infrastructure.demandes import depots as depots_demandes  # noqa: PLC0415

        return circuit.emettre(
            depots_demandes,
            type_cle=DEPENSE,
            objet_id=depense_id,
            motif=motif,
            auteur=auteur,
            maintenant=maintenant,
        ).code

    def retirer(
        self,
        depense_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str | None:
        from optiboul.demandes.infrastructure.demandes import depots as depots_demandes  # noqa: PLC0415

        return circuit.annuler(
            depots_demandes,
            type_cle=DEPENSE,
            objet_id=depense_id,
            motif=motif,
            auteur=auteur,
            maintenant=maintenant,
        )


autorisations = AutorisationsDjango()


def enregistrer() -> None:
    circuit.enregistrer_type(TYPE_DEPENSE)
