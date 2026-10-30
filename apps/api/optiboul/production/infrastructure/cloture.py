"""Ce que la production apporte à la clôture de semaine et à la passation (R3)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_archivage
from optiboul.core.application.cloture import enregistrer_controle
from optiboul.core.application.passation import enregistrer_incidents
from optiboul.core.infrastructure.journal import journaliser
from optiboul.production.domain.production import StatutProduction

from .models import PlanProduction
from .models import Production

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.semaines import EtatSemaine


def production_en_cours(semaine: EtatSemaine) -> Controle:
    """Bloquant : une production de la semaine n'est pas clôturée (R3)."""
    production = (
        Production.objects.filter(
            semaine_id=semaine.id,
            statut=StatutProduction.EN_COURS,
        )
        .select_related("plan", "ouverte_par")
        .first()
    )
    if production is None:
        return Controle("production", Niveau.OK)
    plan = production.plan
    return Controle(
        "production",
        Niveau.BLOQUANT,
        f"La production de {plan.creneau} du {plan.jour:%d/%m} n'est pas clôturée.",
        {
            "session": {
                "type": plan.creneau,
                "jour": plan.jour.isoformat(),
                "par": production.ouverte_par.name,
            },
        },
    )


def incidents(semaine: EtatSemaine) -> list[str]:
    """Productions démarrées provisoires, sans validation du gérant (O6)."""
    return [
        f"Production de {plan.creneau} du {plan.jour:%d/%m} démarrée provisoire"
        for plan in PlanProduction.objects.filter(
            semaine_id=semaine.id,
            statut="provisoire",
        ).order_by("jour", "creneau")
    ]


def archiver(semaine: EtatSemaine, auteur: Auteur) -> list[str]:
    """Clôture forcée : la production en cours est archivée « non clôturée »."""
    archivees = []
    for production in Production.objects.filter(
        semaine_id=semaine.id,
        statut=StatutProduction.EN_COURS,
    ).select_related("plan"):
        Production.objects.filter(pk=production.pk).update(
            statut=StatutProduction.NON_CLOTUREE,
        )
        journaliser(
            "production.non_cloturee",
            auteur=auteur,
            objet_type="production",
            objet_id=production.pk,
            avant={"statut": StatutProduction.EN_COURS},
            apres={"statut": StatutProduction.NON_CLOTUREE},
        )
        plan = production.plan
        archivees.append(f"production de {plan.creneau} du {plan.jour:%d/%m}")
    return archivees


def enregistrer() -> None:
    enregistrer_controle("production", production_en_cours)
    enregistrer_archivage("production", archiver)
    enregistrer_incidents("production", incidents)
