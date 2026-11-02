from datetime import timedelta
from unittest import mock

import pytest
from django.core import mail
from django.utils import timezone

from optiboul.notifications.domain.envois import TENTATIVES_MAX
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.domain.envois import StatutEnvoi
from optiboul.notifications.domain.envois import delai_avant_nouvel_essai
from optiboul.notifications.domain.envois import masquer_telephone
from optiboul.notifications.infrastructure.envois import PasserelleJournalisation
from optiboul.notifications.infrastructure.envois import envoyer_en_attente
from optiboul.notifications.infrastructure.envois import file_envoi
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.notifications.infrastructure.models import Notification


def test_delai_croissant_plafonne():
    assert delai_avant_nouvel_essai(1) == timedelta(seconds=30)
    assert delai_avant_nouvel_essai(2) == timedelta(minutes=1)
    assert delai_avant_nouvel_essai(3) == timedelta(minutes=2)
    assert delai_avant_nouvel_essai(30) == timedelta(hours=1)


@pytest.mark.parametrize(
    ("numero", "masque"),
    [
        ("677412018", "+237 6 •• •• 20 18"),
        ("+237 6 77 41 20 18", "+237 6 •• •• 20 18"),
        ("12", "•• •• ••"),
    ],
)
def test_numero_masque(numero, masque):
    assert masquer_telephone(numero) == masque


@pytest.mark.django_db
def test_notifier_un_profil(proprietaire, gerant, caissiere):
    envoyees = notificateur.notifier_profils(
        ["gerant", "proprietaire"],
        genre="t",
        titre="T",
    )
    assert envoyees == 2
    assert set(Notification.objects.values_list("destinataire", flat=True)) == {
        proprietaire.pk,
        gerant.pk,
    }


@pytest.mark.django_db
def test_la_file_envoie_et_rejoue_apres_echec():
    file_envoi.mettre_en_file(
        Canal.EMAIL,
        "willy@gmail.com",
        "Bonjour",
        sujet="Invitation",
    )
    file_envoi.mettre_en_file(Canal.SMS, "677412018", "Code : 123456")
    with mock.patch.object(
        PasserelleJournalisation,
        "envoyer",
        side_effect=OSError("réseau coupé"),
    ):
        assert envoyer_en_attente() == 1
    assert mail.outbox[0].to == ["willy@gmail.com"]
    sms = MessageSortant.objects.get(canal=Canal.SMS)
    assert sms.statut == StatutEnvoi.EN_ATTENTE
    assert sms.tentatives == 1
    assert sms.prochain_essai > timezone.now()
    assert "réseau coupé" in sms.derniere_erreur

    # Pas encore dû : rien ne part.
    assert envoyer_en_attente() == 0
    MessageSortant.objects.update(prochain_essai=timezone.now())
    assert envoyer_en_attente() == 1
    sms.refresh_from_db()
    assert sms.statut == StatutEnvoi.ENVOYE
    assert sms.envoye_le is not None


@pytest.mark.django_db
def test_echec_definitif_apres_trop_de_tentatives(settings):
    settings.OPTIBOUL_PASSERELLES = {"sms": None}
    file_envoi.mettre_en_file(Canal.SMS, "677412018", "Code")
    MessageSortant.objects.update(tentatives=TENTATIVES_MAX - 1)
    envoyer_en_attente()
    message = MessageSortant.objects.get()
    assert message.statut == StatutEnvoi.ECHEC
    assert "Aucune passerelle" in message.derniere_erreur
