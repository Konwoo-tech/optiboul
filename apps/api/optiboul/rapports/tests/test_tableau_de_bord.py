from datetime import date

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.rapports.domain.indicateurs import bornes_du_mois
from optiboul.rapports.domain.indicateurs import taux_encaissement
from optiboul.ventes.infrastructure.models import Encaissement
from optiboul.ventes.infrastructure.models import Livraison

TABLEAU = reverse("api:tableau-de-bord")


def test_taux_et_bornes():
    assert taux_encaissement(8_000, 10_000) == 80
    assert taux_encaissement(0, 0) is None
    assert bornes_du_mois(date(2026, 12, 15)) == (date(2026, 12, 1), date(2027, 1, 1))


@pytest.fixture
def octobre(s44, caissiere):
    client = Client.objects.create(nom="Mama Rasta")
    caisse = Caisse.objects.create(
        semaine=s44,
        jour=date(2026, 10, 26),
        creneau="jour",
        caissiere=caissiere,
        fonds=20_000,
        statut="fermee",
        en_cours=False,
        ecart=-500,
    )
    Livraison.objects.create(
        numero=1,
        semaine=s44,
        caisse=caisse,
        client=client,
        montant_du=10_000,
        solde_avant=0,
        solde_apres=-2_000,
        cree_par=caissiere,
    )
    Encaissement.objects.create(
        semaine=s44,
        caisse=caisse,
        client=client,
        mode="especes",
        montant=8_000,
        cree_par=caissiere,
    )
    MouvementCompte.objects.create(
        client=client,
        semaine=s44,
        sens=-1,
        montant=2_000,
        source_type="livraison",
        source_id=1,
        auteur=caissiere,
    )


pytestmark = pytest.mark.django_db


def test_indicateurs_du_mois(client_de, proprietaire, octobre):
    reponse = client_de(proprietaire).get(TABLEAU, {"mois": "2026-10"})
    assert reponse.status_code == 200, reponse.content
    tableau = reponse.json()
    assert tableau["indicateurs"] == {
        "recette": 8_000,
        "ventes": 10_000,
        "taux_encaissement": 80,
        "dettes_clients": 2_000,
        "dettes_fournisseurs": 0,
        "ecart_caisse_cumule": -500,
        "marge_estimee": {"matieres": 0, "charges": 0, "marge": 8_000},
    }
    assert tableau["graphiques"]["recette_par_session"] == [
        {"jour": "2026-10-26", "creneau": "jour", "recette": 8_000},
    ]
    assert len(tableau["graphiques"]["budget_par_categorie"]) == 9


def test_autre_mois_et_droits(client_de, caissiere, gerant, octobre):
    novembre = client_de(gerant).get(TABLEAU, {"mois": "2026-11"}).json()
    assert novembre["indicateurs"]["recette"] == 0
    assert novembre["indicateurs"]["taux_encaissement"] is None
    assert client_de(caissiere).get(TABLEAU).status_code == 403
    assert client_de(gerant).get(TABLEAU, {"mois": "octobre"}).status_code == 400
