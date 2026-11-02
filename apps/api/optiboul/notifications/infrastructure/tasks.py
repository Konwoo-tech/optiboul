"""Tâches Celery de l'application notifications."""

from celery import shared_task

from .envois import envoyer_en_attente


@shared_task(name="notifications.envoyer_file")
def envoyer_file() -> int:
    """Toutes les 30 s (spécification §8) : rejoue la file d'envoi."""
    return envoyer_en_attente()
