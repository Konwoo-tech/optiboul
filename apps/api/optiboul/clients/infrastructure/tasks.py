"""Tâches Celery de l'application clients (spécification §8)."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from optiboul.clients.domain.clients import relance_due
from optiboul.core.application.journal import SYSTEME
from optiboul.core.infrastructure.parametres import parametre

from .cloture import debiteurs
from .models import Relance
from .relances import relancer_dettes


@shared_task(name="clients.relances_automatiques")
def relances_automatiques() -> int:
    """Chaque minute : aux jours et à l'heure paramétrés, une fois par jour (O11)."""
    maintenant = timezone.localtime()
    deja = Relance.objects.filter(
        motif="dette",
        automatique=True,
        cree_le__date=maintenant.date(),
    ).exists()
    if deja or not relance_due(
        maintenant,
        parametre("relances_jours"),
        parametre("relances_heure"),
    ):
        return 0
    clients = [client for client, _ in debiteurs()]
    with transaction.atomic():
        resultat = relancer_dettes(clients, auteur=SYSTEME, automatique=True)
    return len(resultat.relances)
