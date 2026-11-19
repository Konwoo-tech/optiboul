"""Ce que les demandes de validation apportent à la clôture de la semaine (#344)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_controle

from .models import Demande

if TYPE_CHECKING:
    from optiboul.core.application.semaines import EtatSemaine


def demandes_en_attente(semaine: EtatSemaine) -> Controle:
    """À voir (CdC §5.1) : des demandes attendent encore une décision."""
    numeros = list(
        Demande.objects.filter(statut="en_attente")
        .order_by("numero")
        .values_list("numero", flat=True),
    )
    if not numeros:
        return Controle("demandes_en_attente", Niveau.OK, "", {"numeros": []})
    return Controle(
        "demandes_en_attente",
        Niveau.SURVEILLER,
        f"{len(numeros)} demande(s) en attente de décision.",
        {"numeros": numeros},
    )


def enregistrer() -> None:
    enregistrer_controle("demandes_en_attente", demandes_en_attente)
