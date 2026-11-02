"""Ce que la production apporte à la clôture de semaine et à la passation (R3)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_archivage
from optiboul.core.application.cloture import enregistrer_controle
from optiboul.core.application.passation import enregistrer_incidents
from optiboul.core.infrastructure.journal import journaliser
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.production.domain.plan import est_avant
from optiboul.production.domain.production import StatutProduction
from optiboul.ventes.domain.commandes import Session

from .models import PlanProduction
from .models import Production

if TYPE_CHECKING:
    from collections.abc import Iterable

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


def _archiver(productions: Iterable[Production], auteur: Auteur) -> list[str]:
    archivees = []
    for production in productions:
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


def archiver(semaine: EtatSemaine, auteur: Auteur) -> list[str]:
    """Clôture forcée : la production en cours est archivée « non clôturée »."""
    return _archiver(
        Production.objects.filter(
            semaine_id=semaine.id,
            statut=StatutProduction.EN_COURS,
        ).select_related("plan"),
        auteur,
    )


def archiver_depassees(session: Session, auteur: Auteur) -> list[str]:
    """US-085 : une production tourne jusqu'à la session suivante ; encore en cours
    au-delà, elle est archivée « non clôturée » et signalée."""
    en_cours = Production.objects.filter(
        statut=StatutProduction.EN_COURS,
    ).select_related("plan")
    depassees = [
        production
        for production in en_cours
        if est_avant(Session(production.plan.jour, production.plan.creneau), session)
    ]
    archivees = _archiver(depassees, auteur)
    for production in archivees:
        notificateur.notifier_type(
            "production.non_cloturee",
            titre=f"La {production} n'a pas été clôturée",
            message="Archivée « non clôturée » : réalisé et sorties de stock à revoir.",
            lien="/atelier/production",
        )
    return archivees


def enregistrer() -> None:
    enregistrer_controle("production", production_en_cours)
    enregistrer_archivage("production", archiver)
    enregistrer_incidents("production", incidents)
