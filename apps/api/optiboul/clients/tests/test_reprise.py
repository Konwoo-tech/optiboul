from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import Workbook

from optiboul.clients.domain.reprise import LigneRejetee
from optiboul.clients.domain.reprise import lire_client
from optiboul.clients.infrastructure.comptes import solde_de
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import TarifClient
from optiboul.core.infrastructure.models import LigneJournal

IMPORTER = reverse("api:client-importer")


def test_ligne_valide():
    ligne = lire_client(
        {"nom": " Mama ", "telephone": "699112233", "solde": -1500, "plafond": None},
    )
    assert (ligne.nom, ligne.solde, ligne.plafond) == ("Mama", -1500, None)


@pytest.mark.parametrize(
    "valeurs",
    [
        {"nom": ""},
        {"nom": "A", "type": "martien"},
        {"nom": "A", "telephone": "12"},
        {"nom": "A", "solde": 10.5},
        {"nom": "A", "solde": "beaucoup"},
    ],
)
def test_lignes_rejetees(valeurs):
    with pytest.raises(LigneRejetee):
        lire_client(valeurs)


pytestmark = pytest.mark.django_db


def _classeur(clients, tarifs=()):
    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Clients"
    feuille.append(["nom", "type", "telephone", "lieu", "plafond", "solde"])
    for ligne in clients:
        feuille.append(ligne)
    autre = classeur.create_sheet("Tarifs")
    autre.append(["client", "produit", "prix"])
    for ligne in tarifs:
        autre.append(ligne)
    tampon = BytesIO()
    classeur.save(tampon)
    return SimpleUploadedFile("reprise.xlsx", tampon.getvalue())


def _importer(client, fichier, **corps):
    return client.post(IMPORTER, {"fichier": fichier, **corps}, format="multipart")


LIGNES = [
    ["Mama Rasta", "livreur", "699112233", "Etoudi", None, -1500],
    ["Raoul", "restaurant", "", "", 1000, -3000],
    ["Sans numéro valide", "livreur", "123", "", None, 0],
]
TARIFS = [["Mama Rasta", "BAG", 90], ["Inconnu", "BAG", 90], ["Raoul", "ZZZ", 90]]


def test_simulation_ne_garde_rien(client_de, administrateur, s44):
    reponse = _importer(client_de(administrateur), _classeur(LIGNES, TARIFS))
    assert reponse.status_code == 200, reponse.content
    corps = reponse.json()
    assert (corps["clients"], corps["soldes"], corps["tarifs"]) == (2, 2, 1)
    assert corps["simulation"] is True
    assert not Client.objects.exists()


def test_import_confirme(client_de, administrateur, s44):
    reponse = _importer(
        client_de(administrateur),
        _classeur(LIGNES, TARIFS),
        confirmer="true",
    )
    corps = reponse.json()
    assert corps["simulation"] is False
    mama = Client.objects.get(nom="Mama Rasta")
    assert solde_de(mama.pk) == -1_500
    assert TarifClient.objects.get(client=mama).prix == 90
    assert [rejet["ligne"] for rejet in corps["rejets"]] == [4, 3, 4]
    assert corps["dettes_au_dela_du_plafond"] == [
        {"nom": "Raoul", "dette": 3_000, "plafond": 1_000},
    ]
    assert LigneJournal.objects.filter(action="clients.import").exists()


def test_reimport_sans_doublon(client_de, administrateur, s44):
    client = client_de(administrateur)
    _importer(client, _classeur(LIGNES), confirmer="true")
    corps = _importer(client, _classeur(LIGNES), confirmer="true").json()
    assert corps["clients"] == 0
    assert solde_de(Client.objects.get(nom="Mama Rasta").pk) == -1_500


def test_solde_sans_semaine_ouverte_rejete(client_de, administrateur):
    corps = _importer(client_de(administrateur), _classeur(LIGNES)).json()
    assert corps["soldes"] == 0
    assert "semaine" in corps["rejets"][0]["raison"]


def test_fichier_illisible(client_de, administrateur):
    faux = SimpleUploadedFile("faux.xlsx", b"pas un classeur")
    reponse = _importer(client_de(administrateur), faux)
    assert reponse.status_code == 400
    assert reponse.json()["code"] == "fichier_invalide"


def test_reserve_a_l_administrateur(client_de, gerant):
    assert _importer(client_de(gerant), _classeur(LIGNES)).status_code == 403
