"""Contrôle avant clôture de semaine fourni par la caisse (R3, US-033)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_controle

from .models import Caisse

if TYPE_CHECKING:
    from optiboul.core.application.semaines import EtatSemaine


def caisse_ouverte(semaine: EtatSemaine) -> Controle:
    """Bloquant : une caisse de la semaine est encore ouverte."""
    caisse = (
        Caisse.objects.filter(semaine_id=semaine.id, en_cours=True)
        .select_related("caissiere")
        .first()
    )
    if caisse is None:
        return Controle("caisse", Niveau.OK)
    heure = timezone.localtime(caisse.ouverte_le)
    return Controle(
        "caisse",
        Niveau.BLOQUANT,
        f"La caisse de {caisse.creneau} du {caisse.jour:%d/%m} est encore ouverte.",
        {
            "session": {
                "type": caisse.creneau,
                "jour": caisse.jour.isoformat(),
                "par": caisse.caissiere.name,
                "heure": f"{heure:%H:%M}",
            },
        },
    )


def enregistrer() -> None:
    enregistrer_controle("caisse", caisse_ouverte)
