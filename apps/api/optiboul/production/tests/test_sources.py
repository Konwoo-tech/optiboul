from datetime import date

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.conftest import MARDI
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.infrastructure.models import Produit
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.infrastructure.models import MouvementInterne

from .conftest import commander

pytestmark = pytest.mark.django_db

PLAN = reverse("api:production-plan")
PROPOSER = reverse("api:production-proposer")


def _nuit(jours_avant: int) -> Session:
    return Session(date.fromordinal(MARDI.toordinal() - jours_avant), NUIT)


@pytest.fixture
def trois_sources(s44, caissiere, commandes_du_soir):
    """Ce soir 700 BAG commandés ; Hôtel Ibrahim, habitué à 300 BAG, n'a pas commandé ;
    le guichet a vendu 40 puis 80 BAG sur les 4 dernières nuits."""
    for jours_avant, pains in [(1, 300), (2, 300), (3, 300)]:
        commander(s44, caissiere, "Hôtel Ibrahim", {"BAG": pains}, _nuit(jours_avant))
    baguette = Produit.objects.get(code="BAG")
    for jours_avant, pains in [(1, 40), (2, 80)]:
        session = _nuit(jours_avant)
        caisse = Caisse.objects.create(
            semaine=s44,
            jour=session.jour,
            creneau=NUIT,
            caissiere=caissiere,
            fonds=20_000,
            statut="fermee",
            en_cours=False,
        )
        MouvementInterne.objects.create(
            semaine=s44,
            caisse=caisse,
            genre="vente_guichet",
            produit=baguette,
            quantite=pains,
            motif="Guichet",
            cree_par=caissiere,
        )


def test_chaque_source_affichee(client_de, gerant, trois_sources):
    plan = client_de(gerant).get(PLAN, {"jour": "2026-10-27", "creneau": "nuit"}).json()
    baguette = next(item for item in plan["lignes"] if item["code"] == "BAG")
    assert {
        cle: baguette[cle]
        for cle in ("commandes", "habituels", "guichet", "estimee", "base", "sacs")
    } == {
        "commandes": 700,
        "habituels": 300,
        "guichet": 30,
        "estimee": 1_030,
        "base": 3,
        "sacs": 3,
    }
    assert (baguette["besoin"], baguette["au_dessus_du_plan"]) == (1, True)
    assert plan["alerte"] is True


def test_alerte_si_la_demande_estimee_depasse_le_plan(
    client_de,
    responsable_production,
    proprietaire,
    trois_sources,
    heure,
):
    with heure(18, 45):
        client_de(responsable_production).post(PROPOSER, {}, format="json")
    prevenus = set(
        Notification.objects.filter(genre="plan.demande_superieure").values_list(
            "destinataire__name",
            flat=True,
        ),
    )
    assert prevenus == {"Serge", "Willy", "Fotso"}
    alerte = Notification.objects.filter(genre="plan.demande_superieure").first()
    assert alerte is not None
    assert alerte.message == "BAG 1030 pains pour 945"


def test_supplement_motive_du_chef(
    client_de,
    responsable_production,
    trois_sources,
    heure,
):
    with heure(18, 45):
        sans_motif = client_de(responsable_production).post(
            PROPOSER,
            {"supplement": {"BAG": 1}},
            format="json",
        )
        assert sans_motif.json()["code"] == "motif_obligatoire"
        reponse = client_de(responsable_production).post(
            PROPOSER,
            {"supplement": {"BAG": 1}, "motif": "habituels"},
            format="json",
        )
    assert reponse.status_code == 200, reponse.content
    plan = reponse.json()
    baguette = next(item for item in plan["lignes"] if item["code"] == "BAG")
    assert (baguette["base"], baguette["supplement"], baguette["sacs"]) == (3, 1, 4)
    assert (baguette["prevus"], baguette["au_dessus_du_plan"]) == (1_260, False)
    assert plan["motif_supplement"] == "habituels"
    assert not Notification.objects.filter(genre="plan.demande_superieure").exists()
    # Le plan relu garde le supplément enregistré.
    relu = client_de(responsable_production).get(
        PLAN,
        {"jour": "2026-10-27", "creneau": "nuit"},
    )
    assert relu.json()["sacs"] == plan["sacs"]


def test_moyenne_parametrable(client_de, proprietaire, gerant, trois_sources):
    client_de(proprietaire).put(
        reverse("api:parametre-detail", kwargs={"cle": "demande_estimee_sessions"}),
        {"valeur": 2},
        format="json",
    )
    plan = client_de(gerant).get(PLAN, {"jour": "2026-10-27", "creneau": "nuit"}).json()
    baguette = next(item for item in plan["lignes"] if item["code"] == "BAG")
    # Sur 2 nuits : guichet (40 + 80) / 2 ; l'hôtel a commandé 2 fois sur 2.
    assert (baguette["guichet"], baguette["habituels"]) == (60, 300)
