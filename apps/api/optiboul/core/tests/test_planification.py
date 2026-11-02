from django.conf import settings

from config.celery_app import app


def test_chaque_tache_planifiee_est_decouverte_par_celery():
    """Celery ne lit que `<application>/tasks.py` : sinon, la tâche ne tourne pas."""
    app.loader.import_default_modules()
    planifiees = {tache["task"] for tache in settings.CELERY_BEAT_SCHEDULE.values()}
    assert planifiees <= set(app.tasks)
