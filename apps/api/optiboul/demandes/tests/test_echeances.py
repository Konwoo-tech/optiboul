from datetime import timedelta
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.conftest import MARDI_8H
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.application import demandes as cas
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.demandes.infrastructure.models import Demande
from optiboul.demandes.infrastructure.tasks import escalader
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.notifications.infrastructure.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture
def type_a_echeance():
    """La caisse demande, le gérant seul valide, 5 minutes pour répondre."""
    urgent = TypeDemande(
        cle="urgent",
        libelle="Urgent",
        objet_type="client",
        emetteurs=frozenset({"caissier"}),
        valideurs=lambda profil: ("gerant",),
        preparer=lambda objet_id, auteur: ObjetLie(f"Objet {objet_id}"),
        echeance=lambda emise_le: emise_le + timedelta(minutes=5),
    )
    cas.enregistrer_type(urgent)
    yield urgent
    cas._TYPES.pop("urgent")  # noqa: SLF001


@pytest.fixture
def demande(client_de, caissiere, type_a_echeance, horloge) -> Demande:
    reponse = client_de(caissiere).post(
        reverse("api:demande-list"),
        {"type": "urgent", "objet_id": 7, "motif": "Il faut une réponse"},
        format="json",
    )
    return Demande.objects.get(pk=reponse.json()["id"])


def _a(minutes: int):
    return mock.patch(
        "django.utils.timezone.now",
        return_value=MARDI_8H + timedelta(minutes=minutes),
    )


def test_echeance_selon_le_type(demande):
    assert demande.echeance == MARDI_8H + timedelta(minutes=5)
    assert demande.escaladee_le is None


def test_remontee_au_proprietaire(client_de, demande, proprietaire, gerant):
    proprietaire.telephone = "699000002"
    proprietaire.save()
    with _a(4):
        assert escalader() == 0
    with _a(5):
        assert escalader() == 1
    demande.refresh_from_db()
    assert demande.escaladee_le == MARDI_8H + timedelta(minutes=5)
    assert demande.valideurs == ["gerant", "proprietaire"]
    alerte = Notification.objects.get(
        destinataire=proprietaire,
        genre="demande.escaladee",
    )
    assert alerte.titre == "DEM-001 sans réponse · Urgent"
    assert MessageSortant.objects.filter(destinataire="699000002").count() == 1
    assert LigneJournal.objects.filter(action="demande.escaladee").count() == 1
    # Une seule remontée ; le propriétaire peut maintenant décider.
    with _a(30):
        assert escalader() == 0
    en_attente = client_de(proprietaire).get(reverse("api:demande-en-attente")).json()
    assert [d["code"] for d in en_attente] == ["DEM-001"]
    assert en_attente[0]["escaladee_le"] is not None
    # Le gérant peut toujours répondre.
    reponse = client_de(gerant).post(
        reverse("api:demande-accorder", kwargs={"pk": demande.pk}),
        {},
        format="json",
    )
    assert reponse.json()["statut"] == "accordee"


def test_une_demande_tranchee_ne_remonte_pas(client_de, demande, gerant):
    client_de(gerant).post(
        reverse("api:demande-refuser", kwargs={"pk": demande.pk}),
        {"motif": "Non"},
        format="json",
    )
    with _a(10):
        assert escalader() == 0


def test_sans_echeance_pas_de_remontee(client_de, caissiere, type_essai, mama, horloge):
    client_de(caissiere).post(
        reverse("api:demande-list"),
        {"type": "essai", "objet_id": mama.pk, "motif": "x"},
        format="json",
    )
    assert Demande.objects.get().echeance is None
    with _a(60 * 24):
        assert escalader() == 0
