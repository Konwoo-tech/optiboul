"""Lecture des totaux de l'Excel et comparaison avec l'application (US-151).

Feuille attendue : la première du classeur, colonnes jour (date), creneau, ventes,
recette, une ligne par session.
"""

from __future__ import annotations

from datetime import date
from datetime import datetime
from typing import TYPE_CHECKING
from typing import Any
from zipfile import BadZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.rapports.domain.rapprochement import Totaux
from optiboul.rapports.domain.rapprochement import comparer

from .exports import rapport_de_semaine

if TYPE_CHECKING:
    from typing import BinaryIO

    from optiboul.core.infrastructure.models import Semaine
    from optiboul.rapports.domain.rapprochement import Ecart


def _jour(valeur: Any) -> str:
    if isinstance(valeur, datetime | date):
        return f"{valeur:%d/%m/%Y}"
    return str(valeur or "").strip()


def totaux_excel(fichier: BinaryIO) -> dict[tuple[str, str], Totaux]:
    try:
        feuille = load_workbook(fichier, read_only=True, data_only=True).worksheets[0]
    except (InvalidFileException, BadZipFile, OSError, KeyError) as erreur:
        message = "Ce fichier n'est pas un classeur Excel lisible."
        raise RefusMetier("fichier_invalide", message) from erreur
    rangees = feuille.iter_rows(values_only=True)
    entetes = [str(e or "").strip().lower() for e in next(rangees, ())]
    if not {"jour", "creneau", "ventes", "recette"} <= set(entetes):
        message = "Colonnes attendues : jour, creneau, ventes, recette."
        raise RefusMetier("fichier_invalide", message)
    totaux = {}
    for rangee in rangees:
        ligne = dict(zip(entetes, rangee, strict=False))
        if not ligne.get("jour"):
            continue
        try:
            total = Totaux(int(ligne["ventes"] or 0), int(ligne["recette"] or 0))
        except (TypeError, ValueError) as erreur:
            message = f"Montant illisible le {_jour(ligne['jour'])}."
            raise RefusMetier("fichier_invalide", message) from erreur
        cle = (_jour(ligne["jour"]), str(ligne.get("creneau") or "").strip().lower())
        totaux[cle] = total
    return totaux


def rapprocher(semaine: Semaine, fichier: BinaryIO) -> list[Ecart]:
    application = {
        (jour, creneau): Totaux(ventes, recette)
        for jour, creneau, ventes, recette, _, _ in rapport_de_semaine(semaine).lignes
    }
    return comparer(application, totaux_excel(fichier))
