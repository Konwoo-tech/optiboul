"""Tâches Celery de l'application production."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from optiboul.core.application.journal import SYSTEME
from optiboul.core.infrastructure.parametres import parametre
from optiboul.production.application.plans import valider_automatiquement
from optiboul.production.domain.plan import session_de_production
from optiboul.ventes.infrastructure.commandes import limites

from .plans import depots
from .plans import nombre_de_sessions
from .plans import petrissage


@shared_task(name="production.valider_plan_auto")
def valider_plan_auto() -> str | None:
    """Chaque minute (spécification §8) : à T-15 min du pétrissage, le plan sans
    réponse est validé dans la tolérance, sinon la production démarre provisoire."""
    maintenant = timezone.now()
    session = session_de_production(maintenant, limites())
    with transaction.atomic():
        statut = valider_automatiquement(
            depots,
            session=session,
            maintenant=maintenant,
            petrissage=petrissage(session.creneau),
            tolerance=parametre("tolerance_validation_plan"),
            nombre=nombre_de_sessions(),
            systeme=SYSTEME,
        )
    return str(statut) if statut else None
