"""Pertes, casse et corrections motivées (US-092, CdC §5.6)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens

if TYPE_CHECKING:
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.semaines import DepotSemaines

    from .stocks import Stock

SAISISSENT = frozenset({"gerant", "production"})
SEQUENCE = "saisie_stock"


class Numeros(Protocol):
    def prochain(self, nom: str) -> int: ...


@dataclass(frozen=True)
class Depots:
    stock: Stock
    semaines: DepotSemaines
    numeros: Numeros
    journal: Journal


def saisir(  # noqa: PLR0913
    depots: Depots,
    *,
    matiere: str,
    quantite: Decimal,
    genre: GenreMouvementStock,
    sens: Sens,
    motif: str,
    auteur: Auteur,
) -> int:
    """Une perte sort du stock ; une correction va dans les deux sens."""
    if auteur.profil not in SAISISSENT or auteur.utilisateur_id is None:
        message = "Seuls le gérant et le responsable de production saisissent."
        raise RefusMetier("droit_insuffisant", message)
    semaine = depots.semaines.ouverte()
    if semaine is None:
        message = "Aucune semaine n'est ouverte (R1)."
        raise RefusMetier("semaine_non_ouverte", message)
    if not motif.strip():
        raise RefusMetier("motif_obligatoire", "Le motif est obligatoire.")
    if quantite <= 0:
        raise RefusMetier("quantite_invalide", "La quantité est positive.")
    if matiere not in depots.stock.suivies():
        message = "Cette matière n'est pas suivie en stock."
        raise RefusMetier("matiere_inconnue", message)
    if genre is GenreMouvementStock.PERTE and sens is not Sens.SORTIE:
        raise RefusMetier("sens_invalide", "Une perte sort du stock.")
    disponible = depots.stock.quantites()[matiere]
    if sens is Sens.SORTIE and quantite > disponible:
        message = f"Stock insuffisant : {disponible} disponible."
        raise RefusMetier("stock_insuffisant", message, disponible=str(disponible))
    numero = depots.numeros.prochain(SEQUENCE)
    depots.stock.mouvementer(
        {matiere: quantite},
        sens=sens,
        genre=genre,
        source_type="saisie",
        source_id=numero,
        semaine=semaine.id,
        auteur=auteur.utilisateur_id,
        motif=motif.strip(),
    )
    depots.journal.enregistrer(
        Evenement(
            action=f"stock.{genre.value}",
            auteur=auteur,
            objet_type="matiere",
            objet_id=matiere,
            apres={
                "quantite": str(quantite),
                "sens": sens.value,
                "motif": motif.strip(),
            },
        ),
    )
    return numero
