from datetime import datetime
from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse
from django.utils import timezone

from optiboul.notifications.domain.regroupement import Avis
from optiboul.notifications.domain.regroupement import regrouper
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.notifications.infrastructure.models import Notification
from optiboul.notifications.infrastructure.models import RegleNotification

YAOUNDE = ZoneInfo("Africa/Douala")
UNE_HEURE = datetime(2026, 10, 28, 1, 40, tzinfo=YAOUNDE)
GROUPES = reverse("api:notification-regroupees")
MARQUER = reverse("api:notification-marquer-groupe-lu")


def _avis(genre, titre, minutes=0, *, lu=False):
    return Avis(genre, titre, "/x", UNE_HEURE + timedelta(minutes=minutes), lu)


def test_par_type_et_par_heure():
    groupes = regrouper(
        [
            _avis("commande.tardive", "Dernière", 5),
            _avis("commande.tardive", "Première", 0, lu=True),
            _avis("plan.valide", "Plan", 0),
            _avis("commande.tardive", "Plus tard", 30),
        ],
    )
    assert [(g.genre, g.nombre, g.non_lues) for g in groupes] == [
        ("commande.tardive", 2, 1),
        ("plan.valide", 1, 1),
        ("commande.tardive", 1, 1),
    ]
    assert groupes[0].titre == "Dernière"


pytestmark = pytest.mark.django_db


@pytest.fixture
def rafale(gerant, responsable_production):
    for rang in range(3):
        notificateur.notifier_type("commande.tardive", titre=f"Commande {rang}")


def test_la_rafale_tient_en_une_ligne(client_de, gerant, rafale):
    groupes = client_de(gerant).get(GROUPES).json()
    assert len(groupes) == 1
    assert (groupes[0]["nombre"], groupes[0]["non_lues"]) == (3, 3)
    assert groupes[0]["titre"] == "Commande 2"


def test_seulement_les_miennes(client_de, proprietaire, rafale):
    assert client_de(proprietaire).get(GROUPES).json() == []


def test_marquer_un_groupe(client_de, gerant, rafale):
    client = client_de(gerant)
    groupe = client.get(GROUPES).json()[0]
    reponse = client.post(
        MARQUER,
        {"genre": groupe["genre"], "heure": groupe["heure"]},
        format="json",
    )
    assert reponse.json() == {"marquees": 3}
    assert client.get(GROUPES).json()[0]["non_lues"] == 0
    responsable = Notification.objects.exclude(destinataire=gerant)
    assert responsable.filter(lue_le=None).count() == 3


def test_un_seul_sms_par_type_et_par_heure(gerant, responsable_production):
    gerant.telephone = "699000111"
    gerant.save()
    RegleNotification.objects.create(
        genre="commande.tardive",
        profils=["gerant"],
        canaux=["application", "sms"],
    )
    for rang in range(3):
        notificateur.notifier_type("commande.tardive", titre=f"Commande {rang}")
    assert MessageSortant.objects.filter(canal="sms").count() == 1
    Notification.objects.update(cree_le=timezone.now() - timedelta(hours=2))
    notificateur.notifier_type("commande.tardive", titre="Plus tard")
    assert MessageSortant.objects.filter(canal="sms").count() == 2
