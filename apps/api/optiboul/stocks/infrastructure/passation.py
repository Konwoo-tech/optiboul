"""Ce que les stocks apportent au rapport de passation (US-034, #369)."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from typing import Any

from optiboul.core.application.passation import enregistrer_section
from optiboul.core.infrastructure.parametres import parametre
from optiboul.stocks.domain.etat import StatutStock

from .etat import etat_du_stock

if TYPE_CHECKING:
    from optiboul.core.application.semaines import EtatSemaine


def section_stock_bas(semaine: EtatSemaine) -> dict[str, Any]:
    """Matières sous leur seuil : moins de N sessions de consommation (paramètre).

    Le seuil d'une matière est ce nombre de sessions fois son besoin par session.
    """
    sessions = Decimal(parametre("stock_sessions_bas"))
    lignes = [
        {
            "matiere": ligne.nom,
            "quantite": ligne.quantite,
            "seuil": (ligne.besoin_par_session * sessions).quantize(Decimal("0.001")),
            "unite": ligne.unite,
        }
        for ligne in etat_du_stock()
        if ligne.statut is StatutStock.STOCK_BAS
    ]
    return {"lignes": lignes, "sessions": int(sessions)}


def enregistrer() -> None:
    enregistrer_section("stock_bas", section_stock_bas)
