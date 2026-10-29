import pytest
from django.urls import reverse

from optiboul.clients.infrastructure.models import Client
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.application import demandes as cas
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande
from optiboul.demandes.domain.demandes import numero_affiche
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.notifications.infrastructure.models import Notification
from optiboul.users.tests.factories import utilisateur_avec_profil

LISTE = reverse("api:demande-list")


def test_numero_affiche():
    assert numero_affiche(21) == "DEM-021"
    assert numero_affiche(1234) == "DEM-1234"


def _preparer(objet_id, auteur) -> ObjetLie:
    client = Client.objects.filter(pk=objet_id).first()
    if client is None:
        message = "Client inconnu."
        raise RefusMetier("objet_inconnu", message)
    return ObjetLie(f"Client {client.nom}", {"plafond": 2_000})


@pytest.fixture
def type_essai():
    """Type de demande d'essai : la caisse demande, la direction valide."""
    essai = TypeDemande(
        cle="essai",
        libelle="Essai",
        objet_type="client",
        emetteurs=frozenset({"caissier"}),
        valideurs=lambda profil: ("gerant", "proprietaire"),
        preparer=_preparer,
    )
    cas.enregistrer_type(essai)
    yield essai
    cas._TYPES.pop("essai")  # noqa: SLF001


@pytest.fixture
def mama(db) -> Client:
    return Client.objects.create(nom="Mama Rasta")


def _emettre(client, objet_id, motif="Client fidèle, paie samedi"):
    return client.post(
        LISTE,
        {"type": "essai", "objet_id": objet_id, "motif": motif},
        format="json",
    )


pytestmark = pytest.mark.django_db


def test_emission_liee_a_l_objet(
    client_de,
    caissiere,
    gerant,
    proprietaire,
    type_essai,
    mama,
):
    gerant.telephone = "677000001"
    gerant.canal_verification = "whatsapp"
    gerant.save()
    reponse = _emettre(client_de(caissiere), mama.pk)
    assert reponse.status_code == 201, reponse.content
    demande = reponse.json()
    assert demande["code"] == "DEM-001"
    assert demande["type_libelle"] == "Essai"
    assert (demande["objet_type"], demande["objet_id"]) == ("client", mama.pk)
    assert demande["objet"] == "Client Mama Rasta"
    assert demande["details"] == {"plafond": 2_000}
    assert demande["motif"] == "Client fidèle, paie samedi"
    assert demande["emetteur"] == {"id": caissiere.pk, "nom": "Rachel"}
    assert demande["valideurs"] == ["gerant", "proprietaire"]
    assert demande["statut"] == "en_attente"
    trace = LigneJournal.objects.get(action="demande.emise")
    assert trace.apres is not None
    assert trace.apres["numero"] == "DEM-001"
    # Le valideur est prévenu dans l'application et sur son téléphone (O5).
    notifiees = set(
        Notification.objects.filter(genre="demande.emise").values_list(
            "destinataire__name",
            flat=True,
        ),
    )
    assert notifiees == {"Willy", "Fotso"}
    message = MessageSortant.objects.get()
    assert (message.canal, message.destinataire) == ("whatsapp", "677000001")
    assert message.contenu.startswith("OptiBoul : DEM-001 · Essai.")


def test_une_seule_demande_en_attente_par_objet(client_de, caissiere, type_essai, mama):
    _emettre(client_de(caissiere), mama.pk)
    reponse = _emettre(client_de(caissiere), mama.pk)
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "demande_deja_en_attente"
    assert "DEM-001" in reponse.json()["detail"]


def test_numeros_communs(client_de, caissiere, type_essai, mama):
    autre = Client.objects.create(nom="Raoul")
    codes = [_emettre(client_de(caissiere), c.pk).json()["code"] for c in (mama, autre)]
    assert codes == ["DEM-001", "DEM-002"]


def test_refus(client_de, caissiere, responsable_production, type_essai, mama):
    assert _emettre(client_de(responsable_production), mama.pk).status_code == 403
    assert _emettre(client_de(caissiere), 999_999).status_code == 404
    assert _emettre(client_de(caissiere), mama.pk, motif="  ").status_code == 400
    reponse = client_de(caissiere).post(
        LISTE,
        {"type": "inconnu", "objet_id": mama.pk, "motif": "x"},
        format="json",
    )
    assert reponse.json()["code"] == "type_demande_inconnu"


def test_qui_voit_la_demande(
    client_de,
    caissiere,
    gerant,
    proprietaire,
    responsable_production,
    type_essai,
    mama,
):
    _emettre(client_de(caissiere), mama.pk)
    davy = utilisateur_avec_profil("caissier", name="Davy")
    vues = {
        personne.name: client_de(personne).get(LISTE).json()["count"]
        for personne in (caissiere, davy, gerant, proprietaire, responsable_production)
    }
    assert vues == {"Rachel": 1, "Davy": 0, "Willy": 1, "Fotso": 1, "Serge": 0}
    en_attente = client_de(gerant).get(reverse("api:demande-en-attente")).json()
    assert [d["code"] for d in en_attente] == ["DEM-001"]
    assert client_de(caissiere).get(reverse("api:demande-en-attente")).json() == []
    assert client_de(gerant).get(LISTE, {"statut": "accordee"}).json()["count"] == 0
