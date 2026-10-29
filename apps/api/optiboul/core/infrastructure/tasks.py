"""Tâches Celery de l'application core."""

from __future__ import annotations

import logging
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from optiboul.core.application import cloture as cas_cloture
from optiboul.core.application import sauvegardes as cas
from optiboul.core.application import semaines as cas_semaines
from optiboul.core.application.journal import SYSTEME
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import a_supprimer
from optiboul.core.domain.sauvegardes import sauvegarde_due
from optiboul.core.domain.semaines import code
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.notifications.infrastructure.models import Notification

from .journal import journal
from .journal import journaliser
from .parametres import parametre
from .sauvegardes import CoffreS3
from .sauvegardes import PgDump
from .sauvegardes import depot_sauvegardes
from .sauvegardes import dossier_sauvegardes
from .semaines import depot_semaines

logger = logging.getLogger(__name__)


def _faire_le_menage() -> None:
    dossier = dossier_sauvegardes()
    fichiers = {
        f.name: datetime.fromtimestamp(f.stat().st_mtime, tz=UTC)
        for f in dossier.glob("optiboul-*.dump")
    }
    for nom in a_supprimer(
        fichiers,
        timezone.now(),
        settings.OPTIBOUL_SAUVEGARDES_CONSERVATION_JOURS,
    ):
        (dossier / nom).unlink(missing_ok=True)


@shared_task(name="core.sauvegarder")
def sauvegarder(declencheur: str) -> int:
    """Copie locale puis copie cloud chiffrée ; un échec cloud garde la locale."""
    try:
        locale = cas.sauvegarder_localement(
            depot_sauvegardes,
            PgDump(),
            dossier=dossier_sauvegardes(),
            declencheur=Declencheur(declencheur),
            maintenant=timezone.localtime(),
        )
    except Exception as erreur:
        journaliser(
            "sauvegarde.echec",
            objet_type="sauvegarde",
            apres={"erreur": str(erreur)},
        )
        raise
    chemin = Path(depot_sauvegardes.fichier(locale))
    try:
        cas.copier_dans_le_cloud(
            depot_sauvegardes,
            CoffreS3(),
            source=locale,
            chemin=chemin,
        )
    except Exception:
        # Sans réseau, la copie cloud attend la prochaine sauvegarde (R22) ; l'alerte
        # « 48 h sans copie » prévient si cela dure.
        logger.warning(
            "Copie cloud de la sauvegarde %s impossible",
            locale,
            exc_info=True,
        )
    _faire_le_menage()
    return locale


@shared_task(name="core.sauvegarde_planifiee")
def sauvegarde_planifiee() -> int | None:
    """Toutes les heures : sauvegarde si la dernière date de N heures (paramètre)."""
    derniere = depot_sauvegardes.derniere_reussie(Genre.LOCALE)
    if not sauvegarde_due(derniere, timezone.now(), parametre("sauvegarde_locale")):
        return None
    return sauvegarder(Declencheur.PLANIFIEE)


@shared_task(name="core.verifier_copie_cloud")
def verifier_copie_cloud() -> bool:
    """Toutes les heures : alerte (une fois par jour) si la copie cloud tarde."""
    maintenant = timezone.now()
    deja_alerte = Notification.objects.filter(
        genre=cas.ALERTE_CLOUD,
        cree_le__gte=maintenant - timedelta(hours=24),
    ).exists()
    return cas.verifier_copie_cloud(
        depot_sauvegardes,
        notificateur,
        maintenant=maintenant,
        seuil_heures=parametre("alerte_sauvegarde_cloud"),
        deja_alerte=deja_alerte,
    )


@shared_task(name="core.ouvrir_semaine")
def ouvrir_semaine() -> int | None:
    """Lundi 06:00 (O8, US-032) : ouverture automatique ou alerte au propriétaire."""
    semaine = cas_semaines.ouvrir_automatiquement(
        depot_semaines,
        journal,
        notificateur,
        maintenant=timezone.now(),
        systeme=SYSTEME,
    )
    return semaine.id if semaine else None


@shared_task(name="core.rappel_cloture_semaine")
def rappel_cloture_semaine() -> int:
    """Dimanche 18:00 (spécification §8) : rappel au gérant de la semaine ouverte."""
    semaine = depot_semaines.ouverte()
    if semaine is None or semaine.gerant is None:
        return 0
    bloquants = [
        c.detail
        for c in cas_cloture.controles(semaine)
        if c.niveau is cas_cloture.Niveau.BLOQUANT
    ]
    message = "Pensez à clôturer la semaine avant lundi 06:00."
    if bloquants:
        message += " À régler d'abord : " + " ".join(bloquants)
    return notificateur.notifier(
        [semaine.gerant],
        genre="semaine.rappel_cloture",
        titre=f"Clôture de la semaine {code(semaine.numero)}",
        message=message,
        lien="/gestion/semaines",
    )
