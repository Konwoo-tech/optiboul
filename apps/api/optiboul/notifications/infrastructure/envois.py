"""Notifications en base et file d'envoi (outbox) rejouée par Celery (O15, R22)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from typing import Protocol

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.domain.envois import StatutEnvoi
from optiboul.notifications.domain.envois import delai_avant_nouvel_essai
from optiboul.notifications.domain.envois import statut_apres_echec

from .models import MessageSortant
from .models import Notification

if TYPE_CHECKING:
    from collections.abc import Iterable

logger = logging.getLogger(__name__)


class NotificateurDjango:
    def notifier_profils(
        self,
        profils: Iterable[str],
        *,
        genre: str,
        titre: str,
        message: str = "",
        lien: str = "",
    ) -> int:
        profils = set(profils)
        utilisateurs = get_user_model().objects.filter(is_active=True)
        ids = [u.pk for u in utilisateurs if u.profil in profils]
        return self.notifier(ids, genre=genre, titre=titre, message=message, lien=lien)

    def notifier(
        self,
        utilisateur_ids: Iterable[int],
        *,
        genre: str,
        titre: str,
        message: str = "",
        lien: str = "",
    ) -> int:
        lignes = [
            Notification(
                destinataire_id=pk,
                genre=genre,
                titre=titre,
                message=message,
                lien=lien,
            )
            for pk in dict.fromkeys(utilisateur_ids)
        ]
        Notification.objects.bulk_create(lignes)
        return len(lignes)


class FileEnvoiDjango:
    def mettre_en_file(  # noqa: PLR0913
        self,
        canal: Canal,
        destinataire: str,
        contenu: str,
        sujet: str = "",
        *,
        objet_type: str = "",
        objet_id: int | None = None,
    ) -> int:
        return MessageSortant.objects.create(
            canal=canal,
            destinataire=destinataire,
            contenu=contenu,
            sujet=sujet,
            objet_type=objet_type,
            objet_id=objet_id,
        ).pk


notificateur = NotificateurDjango()
file_envoi = FileEnvoiDjango()


# ---- Passerelles d'envoi --------------------------------------------------------


class Passerelle(Protocol):
    def envoyer(self, message: MessageSortant) -> None:
        """Envoie le message ou lève une exception (le message sera rejoué)."""


class PasserelleEmail:
    def envoyer(self, message: MessageSortant) -> None:
        send_mail(
            message.sujet or "OptiBoul",
            message.contenu,
            None,
            [message.destinataire],
        )


class PasserelleJournalisation:
    """Développement seulement : écrit le message dans les journaux du conteneur."""

    def envoyer(self, message: MessageSortant) -> None:
        logger.info(
            "Envoi %s à %s : %s",
            message.canal,
            message.destinataire,
            message.contenu,
        )


class PasserelleAbsente(Exception):  # noqa: N818
    pass


def passerelle(canal: str) -> Passerelle:
    chemin = settings.OPTIBOUL_PASSERELLES.get(canal)
    if not chemin:
        message = f"Aucune passerelle configurée pour le canal {canal}."
        raise PasserelleAbsente(message)
    return import_string(chemin)()


def envoyer_en_attente(limite: int = 100) -> int:
    """Envoie les messages dus ; un échec repousse l'envoi, délai croissant."""
    envoyes = 0
    maintenant = timezone.now()
    with transaction.atomic():
        dus = list(
            MessageSortant.objects.select_for_update(skip_locked=True)
            .filter(statut=StatutEnvoi.EN_ATTENTE, prochain_essai__lte=maintenant)
            .order_by("prochain_essai", "id")[:limite],
        )
        for message in dus:
            try:
                passerelle(message.canal).envoyer(message)
            except Exception as erreur:  # noqa: BLE001 : toute erreur réseau est rejouée
                message.tentatives += 1
                message.statut = statut_apres_echec(message.tentatives)
                message.prochain_essai = maintenant + delai_avant_nouvel_essai(
                    message.tentatives,
                )
                message.derniere_erreur = str(erreur)[:1000]
            else:
                message.statut = StatutEnvoi.ENVOYE
                message.envoye_le = timezone.now()
                message.derniere_erreur = ""
                envoyes += 1
            message.save()
    return envoyes
