from datetime import date

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.users.tests.factories import utilisateur_avec_profil
from optiboul.ventes.infrastructure.models import Encaissement

LISTE = reverse("api:caisse-list")
RECAP = reverse("api:caisse-recapitulatif")


@pytest.fixture
def historique(s44, caissiere):
    """Rachel : deux caisses, un manque puis un excédent ; Davy : une caisse juste."""
    davy = utilisateur_avec_profil("caissier", name="Davy")
    client = Client.objects.create(nom="Mama Rasta")
    for jour, creneau, qui, ecart, recette in [
        (date(2026, 10, 26), "jour", caissiere, -1_500, 40_000),
        (date(2026, 10, 26), "nuit", davy, 0, 25_000),
        (date(2026, 10, 27), "jour", caissiere, 500, 30_000),
    ]:
        caisse = Caisse.objects.create(
            semaine=s44,
            jour=jour,
            creneau=creneau,
            caissiere=qui,
            fonds=20_000,
            statut="fermee",
            en_cours=False,
            ecart=ecart,
        )
        Encaissement.objects.create(
            semaine=s44,
            caisse=caisse,
            client=client,
            mode="especes",
            montant=recette,
            cree_par=qui,
        )
    return davy


pytestmark = pytest.mark.django_db


def test_recapitulatif_par_caissiere(client_de, gerant, caissiere, historique):
    recap = client_de(gerant).get(RECAP).json()
    assert [(r["caissiere"]["nom"], r["ouvertures"]) for r in recap] == [
        ("Davy", 1),
        ("Rachel", 2),
    ]
    rachel = recap[1]
    assert (rachel["recette"], rachel["ecart_cumule"], rachel["manques"]) == (
        70_000,
        -1_000,
        1,
    )


def test_une_caissiere_ne_voit_que_ses_caisses(client_de, caissiere, historique):
    assert client_de(caissiere).get(LISTE).json()["count"] == 2
    recap = client_de(caissiere).get(RECAP).json()
    assert [r["caissiere"]["nom"] for r in recap] == ["Rachel"]
    assert client_de(historique).get(LISTE).json()["count"] == 1


def test_historique_par_jour_et_par_caissiere(client_de, gerant, historique):
    du_lundi = client_de(gerant).get(LISTE, {"du": "2026-10-26", "au": "2026-10-26"})
    assert du_lundi.json()["count"] == 2
    de_davy = client_de(gerant).get(LISTE, {"caissiere": historique.pk})
    assert [c["creneau"] for c in de_davy.json()["results"]] == ["nuit"]
    recap = client_de(gerant).get(RECAP, {"du": "2026-10-27"}).json()
    assert [(r["caissiere"]["nom"], r["ecart_cumule"]) for r in recap] == [
        ("Rachel", 500),
    ]
