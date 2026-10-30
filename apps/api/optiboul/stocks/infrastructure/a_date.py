"""Stock à date (US-094, CdC §5.6) : le soir de n'importe quel jour."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from datetime import time
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.utils import timezone

from optiboul.stocks.domain.stocks import stock_a_date
from optiboul.stocks.domain.stocks import ventiler

from .models import LigneControle
from .models import Matiere
from .models import MouvementStock

if TYPE_CHECKING:
    from datetime import date


@dataclass(frozen=True)
class DernierComptage:
    jour: date
    quantite: Decimal


@dataclass(frozen=True)
class LigneADate:
    matiere: str
    nom: str
    unite: str
    stock: Decimal
    entrees: Decimal
    sorties: Decimal
    ajustements: Decimal
    dernier_comptage: DernierComptage | None


def _fin_de(jour: date) -> datetime:
    return timezone.make_aware(
        datetime.combine(jour + timedelta(days=1), time.min),
    )


def stock_du_soir(jour: date) -> list[LigneADate]:
    """Le registre étant en ajout seul, les inventaires validés y sont déjà écrits :
    le stock du soir est la somme des mouvements jusqu'à minuit."""
    fin = _fin_de(jour)
    debut = fin - timedelta(days=1)
    par_matiere: dict[int, list[MouvementStock]] = {}
    for mouvement in MouvementStock.objects.filter(cree_le__lt=fin):
        par_matiere.setdefault(mouvement.matiere_id, []).append(mouvement)
    comptages: dict[int, DernierComptage] = {}
    for ligne in (
        LigneControle.objects.filter(controle__jour__lte=jour)
        .select_related("controle")
        .order_by("controle__jour")
    ):
        comptages[ligne.matiere_id] = DernierComptage(
            ligne.controle.jour,
            ligne.compte,
        )
    lignes = []
    for matiere in Matiere.objects.filter(stockee=True):
        mouvements = par_matiere.get(matiere.pk, [])
        du_jour = ventiler(
            [
                (m.genre, m.sens, m.quantite)
                for m in mouvements
                if m.cree_le >= debut
            ],
        )
        lignes.append(
            LigneADate(
                matiere=matiere.code,
                nom=matiere.nom,
                unite=matiere.unite,
                stock=stock_a_date([(m.sens, m.quantite) for m in mouvements]),
                entrees=du_jour.entrees,
                sorties=du_jour.sorties,
                ajustements=du_jour.ajustements,
                dernier_comptage=comptages.get(matiere.pk),
            ),
        )
    return lignes
