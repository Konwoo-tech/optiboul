"""Tâches Celery de l'application demandes."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from optiboul.core.application.journal import SYSTEME
from optiboul.demandes.application.demandes import escalader_echues

from .demandes import depots


@shared_task(name="demandes.escalader")
def escalader() -> int:
    """Toutes les minutes (spécification §8) : les demandes échues au propriétaire."""
    with transaction.atomic():
        return escalader_echues(depots, maintenant=timezone.now(), systeme=SYSTEME)
