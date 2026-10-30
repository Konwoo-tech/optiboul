"""État du stock (US-090) : quantité, besoin, sessions restantes, valeur, statut."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from django.db.models import Sum

from optiboul.achats.domain.receptions import POIDS_SAC_FARINE_KG
from optiboul.achats.infrastructure.models import Reception
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.core.infrastructure.parametres import parametre
from optiboul.production.infrastructure.models import Consommation
from optiboul.production.infrastructure.models import Production
from optiboul.stocks.domain.etat import StatutStock
from optiboul.stocks.domain.etat import sessions_restantes
from optiboul.stocks.domain.etat import statut_stock
from optiboul.stocks.domain.etat import valeur_stock

from .models import Matiere
from .stocks import stock

if TYPE_CHECKING:
    from datetime import date

FARINE = "farine"


@dataclass(frozen=True)
class LigneEtat:
    matiere: str
    nom: str
    unite: str
    quantite: Decimal
    besoin_par_session: Decimal
    sessions_restantes: Decimal | None
    prochaine_reception: date | None
    valeur: int
    statut: StatutStock


def prix_unitaires() -> dict[str, Decimal]:
    """Dernier prix reçu de chaque matière ; la farine, au prix du sac (CdC §9)."""
    prix = {
        code: Decimal(montant)
        for code, montant in Reception.objects.filter(prix_unitaire__gt=0)
        .order_by("recue_le", "id")
        .values_list("planifiee__matiere__code", "prix_unitaire")
    }
    prix[FARINE] = Decimal(parametre("prix_sac_farine")) / POIDS_SAC_FARINE_KG
    return prix


def besoins_par_session() -> dict[str, Decimal]:
    """Consommation moyenne des dernières sessions clôturées (paramètre, CdC §9)."""
    dernieres = list(
        Production.objects.filter(statut="cloturee")
        .order_by("-id")
        .values_list("id", flat=True)[: parametre("demande_estimee_sessions")],
    )
    if not dernieres:
        return {}
    return {
        code: total / len(dernieres)
        for code, total in Consommation.objects.filter(production__in=dernieres)
        .values_list("matiere__code")
        .annotate(total=Sum("quantite"))
    }


def prochaines_receptions() -> dict[str, date]:
    prochaines: dict[str, date] = {}
    for code, jour in ReceptionPlanifiee.objects.filter(
        statut="planifiee",
    ).values_list("matiere__code", "prevue_le"):
        prochaines.setdefault(code, jour)
    return prochaines


def etat_du_stock() -> list[LigneEtat]:
    quantites = stock.quantites()
    besoins = besoins_par_session()
    prix = prix_unitaires()
    prochaines = prochaines_receptions()
    bas, a_commander = (
        parametre("stock_sessions_bas"),
        parametre("stock_sessions_commande"),
    )
    lignes = []
    for matiere in Matiere.objects.filter(stockee=True):
        quantite = quantites[matiere.code]
        besoin = besoins.get(matiere.code, Decimal(0))
        sessions = sessions_restantes(quantite, besoin)
        lignes.append(
            LigneEtat(
                matiere=matiere.code,
                nom=matiere.nom,
                unite=matiere.unite,
                quantite=quantite,
                besoin_par_session=besoin,
                sessions_restantes=sessions,
                prochaine_reception=prochaines.get(matiere.code),
                valeur=valeur_stock(quantite, prix.get(matiere.code, Decimal(0))),
                statut=statut_stock(
                    quantite,
                    sessions,
                    bas=bas,
                    a_commander=a_commander,
                ),
            ),
        )
    return lignes
