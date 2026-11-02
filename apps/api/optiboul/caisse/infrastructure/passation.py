"""Ce que la caisse apporte au rapport de passation (US-034, CdC §5.1)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.utils import timezone

from optiboul.core.application.passation import enregistrer_incidents
from optiboul.core.application.passation import enregistrer_section
from optiboul.core.infrastructure.models import LigneJournal

from .models import Caisse

if TYPE_CHECKING:
    from optiboul.core.application.semaines import EtatSemaine


def section_caisses(semaine: EtatSemaine) -> dict[str, Any]:
    """Caisses fermées de la semaine et écart cumulé, en entiers FCFA."""
    fermees = (
        Caisse.objects.filter(semaine_id=semaine.id, statut="fermee")
        .select_related("caissiere")
        .order_by("jour", "ouverte_le")
    )
    lignes = [
        {
            "jour": caisse.jour,
            "creneau": caisse.creneau,
            "caissiere": caisse.caissiere.name,
            "compte": caisse.compte,
            "ecart": caisse.ecart or 0,
        }
        for caisse in fermees
    ]
    derniere = lignes[-1] if lignes else None
    return {
        "lignes": lignes,
        "ecart_cumule": sum(ligne["ecart"] for ligne in lignes),
        "derniere": (
            {
                "jour": derniere["jour"],
                "par": derniere["caissiere"],
                "compte": derniere["compte"],
            }
            if derniere
            else None
        ),
    }


def _reouverture(trace: LigneJournal) -> str:
    moment = timezone.localtime(trace.horodatage)
    motif = (trace.apres or {}).get("motif", "")
    quand = f"{moment:%d/%m à %H:%M}"
    return f"Réouverture de caisse par {trace.acteur_nom} le {quand} : {motif}"


def incidents(semaine: EtatSemaine) -> list[str]:
    """Réouvertures (avec motif) et ouvertures hors planning."""
    caisses = Caisse.objects.filter(semaine_id=semaine.id)
    ids = [str(pk) for pk in caisses.values_list("pk", flat=True)]
    lignes = [
        _reouverture(trace)
        for trace in LigneJournal.objects.filter(
            action="caisse.rouverte",
            objet_type="caisse",
            objet_id__in=ids,
        ).order_by("horodatage")
    ]
    lignes.extend(
        f"Caisse de {caisse.creneau} du {caisse.jour:%d/%m} ouverte hors planning "
        f"par {caisse.caissiere.name}"
        for caisse in caisses.filter(hors_planning=True).select_related("caissiere")
    )
    return lignes


def enregistrer() -> None:
    enregistrer_section("caisses", section_caisses)
    enregistrer_incidents("caisse", incidents)
