"""Tâches Celery de l'application ventes."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from optiboul.core.application.journal import SYSTEME
from optiboul.core.infrastructure.parametres import parametre
from optiboul.ventes.application.habitudes import habituels
from optiboul.ventes.domain.commandes import session_visee
from optiboul.ventes.domain.habitudes import rappel_du

from .commandes import depots
from .commandes import limites
from .habitudes import historique
from .habitudes import nombre_de_sessions
from .habitudes import rappeler
from .habitudes import relances_de_la_session


@shared_task(name="ventes.rappel_habituels")
def rappel_habituels() -> int:
    """Chaque minute : 30 min avant l'heure limite, les habituels sans commande
    reçoivent un rappel WhatsApp, une fois par session (O18)."""
    maintenant = timezone.now()
    session = session_visee(maintenant, limites())
    if not rappel_du(
        maintenant,
        session,
        limites(),
        parametre("rappel_clients_habituels"),
    ):
        return 0
    deja = relances_de_la_session(session)
    a_rappeler = [
        habituel
        for habituel in habituels(
            depots,
            historique,
            session=session,
            nombre=nombre_de_sessions(),
        )
        if habituel.client not in deja
    ]
    with transaction.atomic():
        return len(
            rappeler(a_rappeler, session=session, auteur=SYSTEME, automatique=True),
        )
