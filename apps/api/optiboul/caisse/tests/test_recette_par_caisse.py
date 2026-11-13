"""Recette et auteur de la fermeture sur chaque caisse (#312)."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.ventes.infrastructure.models import Encaissement

CAISSES = reverse("api:caisse-list")
RECAP = reverse("api:caisse-recapitulatif")

pytestmark = pytest.mark.django_db


def _encaisser(caisse, client, montant, mode="especes"):
    Encaissement.objects.create(
        caisse=caisse,
        client=client,
        montant=montant,
        mode=mode,
        reference="R1" if mode != "especes" else "",
        cree_par=caisse.caissiere,
        semaine=caisse.semaine,
    )


@pytest.fixture
def recettes(caisse_ouverte):
    mama = Client.objects.create(nom="Mama")
    _encaisser(caisse_ouverte, mama, 1_000)
    _encaisser(caisse_ouverte, mama, 600, mode="mtn")
    return caisse_ouverte


def _ligne(client):
    return client.get(CAISSES).json()["results"][0]


def test_recette_et_ouverture(client_de, gerant, caissiere, recettes):
    ligne = _ligne(client_de(gerant))
    assert ligne["recette"] == 1_600
    assert ligne["ouverte_par"] == {"id": caissiere.pk, "nom": caissiere.name}
    assert ligne["fermee_par"] is None


def test_fermee_par_puis_rouverte(client_de, gerant, recettes):
    Caisse.objects.filter(pk=recettes.pk).update(
        statut="fermee",
        en_cours=False,
        fermee_par=gerant,
    )
    assert _ligne(client_de(gerant))["fermee_par"]["nom"] == gerant.name


def test_le_recapitulatif_reste_juste(client_de, gerant, recettes):
    Caisse.objects.filter(pk=recettes.pk).update(ecart=-500)
    ligne = client_de(gerant).get(RECAP).json()[0]
    assert (ligne["recette"], ligne["ecart_cumule"], ligne["ouvertures"]) == (
        1_600,
        -500,
        1,
    )


def test_pas_de_requete_par_ligne(client_de, gerant, recettes):
    client = client_de(gerant)
    with CaptureQueriesContext(connection) as une:
        client.get(CAISSES)
    Caisse.objects.create(
        semaine=recettes.semaine,
        jour=recettes.jour,
        creneau="nuit",
        caissiere=recettes.caissiere,
        fonds=20_000,
        statut="fermee",
        en_cours=False,
    )
    with CaptureQueriesContext(connection) as deux:
        client.get(CAISSES)
    assert len(deux) == len(une)
