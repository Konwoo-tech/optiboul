"""Tâches Celery de l'application stocks (spécification §8)."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from optiboul.core.infrastructure.parametres import parametre
from optiboul.stocks.application import controles as cas

from .controles import depots


@shared_task(name="stocks.planifier_controles")
def planifier_controles() -> int:
    """Lundi : les contrôles du mercredi et du dimanche de la semaine."""
    with transaction.atomic():
        return cas.planifier(depots, jours=parametre("controles_stock_jours"))


@shared_task(name="stocks.rappel_controle")
def rappel_controle() -> int:
    """Le jour du contrôle : statut « à faire aujourd'hui » et rappel."""
    with transaction.atomic():
        return cas.rappeler(depots, aujourdhui=timezone.localdate())


@shared_task(name="stocks.marquer_controles_manques")
def marquer_controles_manques() -> int:
    """Chaque nuit : non fait la veille, le contrôle est manqué (R16)."""
    with transaction.atomic():
        return cas.marquer_manques(depots, aujourdhui=timezone.localdate())
