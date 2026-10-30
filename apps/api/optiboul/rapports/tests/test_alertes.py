from datetime import date
from datetime import timedelta
from unittest import mock

import pytest
from django.urls import reverse
from django.utils import timezone

from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import Fournisseur
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.conftest import MARDI_8H
from optiboul.core.infrastructure.models import Sauvegarde

ALERTES = reverse("api:alertes")

pytestmark = pytest.mark.django_db


@pytest.fixture
def anomalies(s44, caissiere):
    """Une facture en retard, un manque de caisse, un plafond dépassé."""
    FactureFournisseur.objects.create(
        numero=1,
        fournisseur=Fournisseur.objects.create(nom="Minoterie"),
        semaine=s44,
        montant=195_250,
        echeance=date(2026, 10, 20),
    )
    Caisse.objects.create(
        semaine=s44,
        jour=date(2026, 10, 26),
        creneau="jour",
        caissiere=caissiere,
        fonds=20_000,
        statut="fermee",
        en_cours=False,
        ecart=-1_500,
    )
    MouvementCompte.objects.create(
        client=Client.objects.create(nom="Raoul"),
        semaine=s44,
        sens=-1,
        montant=5_000,
        source_type="reprise",
        source_id=0,
        auteur=caissiere,
    )


def test_alertes_cliquables(client_de, gerant, anomalies, horloge):
    reponse = client_de(gerant).get(ALERTES)
    assert reponse.status_code == 200, reponse.content
    par_type = {alerte["type"]: alerte for alerte in reponse.json()}
    assert set(par_type) == {
        "factures_en_retard",
        "stock_bas",
        "sauvegarde_cloud_en_retard",
        "plafonds_depasses",
        "manques_de_caisse",
    }
    assert par_type["factures_en_retard"]["lien"].startswith(
        "/gestion/fournisseurs/factures/",
    )
    assert par_type["plafonds_depasses"]["detail"] == "Raoul"
    assert par_type["manques_de_caisse"]["detail"] == "1500 FCFA sur la semaine"
    # Les bloquantes d'abord.
    niveaux = [alerte["niveau"] for alerte in reponse.json()]
    assert niveaux == sorted(niveaux, key=["bloquant", "surveiller"].index)


def test_sauvegarde_cloud_recente(client_de, proprietaire, s44, horloge):
    Sauvegarde.objects.create(
        genre="cloud",
        declencheur="planifiee",
        statut="reussie",
        debut=MARDI_8H - timedelta(hours=2),
    )
    types = {alerte["type"] for alerte in client_de(proprietaire).get(ALERTES).json()}
    assert "sauvegarde_cloud_en_retard" not in types


def test_reserve_a_la_direction(client_de, caissiere):
    with mock.patch("django.utils.timezone.now", return_value=timezone.now()):
        assert client_de(caissiere).get(ALERTES).status_code == 403
