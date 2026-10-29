import pytest
from django.urls import reverse

from optiboul.clients.domain.clients import StatutDette
from optiboul.clients.domain.clients import jauge
from optiboul.clients.domain.clients import statut_dette
from optiboul.clients.infrastructure.cloture import dettes_clients
from optiboul.clients.infrastructure.cloture import reporter_dettes
from optiboul.clients.infrastructure.cloture import section_dettes
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.journal import Auteur
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.semaines import depot_semaines

DETTES = reverse("api:client-dettes")


@pytest.mark.parametrize(
    ("solde", "statut", "part"),
    [
        (500, StatutDette.A_JOUR, 0),
        (0, StatutDette.A_JOUR, 0),
        (-1_500, StatutDette.DETTE, 75),
        (-2_000, StatutDette.DETTE, 100),
        (-3_000, StatutDette.PLAFOND_DEPASSE, 150),
    ],
)
def test_statut_et_jauge(solde, statut, part):
    assert statut_dette(solde, 2_000) == statut
    assert jauge(solde, 2_000) == part


def test_jauge_sans_plafond():
    assert jauge(-1, 0) == 100
    assert jauge(0, 0) == 0


@pytest.fixture
def comptes(s44, caissiere) -> dict[str, Client]:
    """Mama doit 1 500, Raoul 3 000 (plafond dépassé), Rachel a 500 d'avance."""
    clients = {}
    for nom, solde, telephone in [
        ("Mama Rasta", -1_500, "699112233"),
        ("Raoul", -3_000, ""),
        ("Rachel Boutique", 500, ""),
    ]:
        client = Client.objects.create(nom=nom, telephone=telephone)
        MouvementCompte.objects.create(
            client=client,
            semaine=s44,
            sens=1 if solde > 0 else -1,
            montant=abs(solde),
            source_type="reprise",
            source_id=0,
            auteur=caissiere,
        )
        clients[nom] = client
    return clients


@pytest.mark.django_db
def test_liste_des_dettes(client_de, gerant, comptes):
    reponse = client_de(gerant).get(DETTES)
    assert reponse.status_code == 200
    dettes = reponse.json()
    assert (dettes["nombre"], dettes["total"]) == (2, 4_500)
    raoul, mama = dettes["clients"]
    assert raoul["nom"] == "Raoul"
    assert (raoul["solde"], raoul["jauge"], raoul["statut"]) == (
        -3_000,
        150,
        "plafond_depasse",
    )
    assert (mama["solde"], mama["plafond"], mama["jauge"], mama["statut"]) == (
        -1_500,
        2_000,
        75,
        "dette",
    )
    assert mama["telephone"] == "699112233"
    assert mama["reportee"] is False
    filtre = client_de(gerant).get(DETTES, {"statut": "plafond_depasse"}).json()
    assert [c["nom"] for c in filtre["clients"]] == ["Raoul"]


@pytest.mark.django_db
def test_qui_voit_les_dettes(client_de, caissiere, responsable_production, comptes):
    mama = client_de(caissiere).get(DETTES).json()["clients"][1]
    assert mama["telephone"] == "+237 6 •• •• 22 33"
    assert client_de(responsable_production).get(DETTES).status_code == 403


@pytest.mark.django_db
def test_report_des_dettes_a_la_cloture(client_de, gerant, s44, comptes):
    semaine = depot_semaines.obtenir(s44.pk)
    assert semaine is not None
    controle = dettes_clients(semaine)
    assert controle.niveau is Niveau.SURVEILLER
    assert controle.donnees == {"clients": 2, "total": 4_500}
    reporter_dettes(semaine, Auteur(utilisateur_id=gerant.pk, nom="Willy"))
    # R20 : les dettes sont reportées et marquées ; le solde, lui, reste dû.
    assert section_dettes(semaine) == {
        "lignes": [
            {"client": "Raoul", "montant": 3_000},
            {"client": "Mama Rasta", "montant": 1_500},
        ],
        "total": 4_500,
    }
    assert LigneJournal.objects.get(action="dettes.reportees").apres == {
        "clients": 2,
        "total": 4_500,
    }
    dettes = client_de(gerant).get(DETTES).json()
    assert all(c["reportee"] for c in dettes["clients"])
    assert dettes["total"] == 4_500


@pytest.mark.django_db
def test_sans_dette_le_controle_est_ok(s44):
    semaine = depot_semaines.obtenir(s44.pk)
    assert semaine is not None
    assert dettes_clients(semaine).niveau is Niveau.OK
