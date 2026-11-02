from datetime import time
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.domain.plan import StatutPlan
from optiboul.production.domain.plan import dans_la_tolerance
from optiboul.production.domain.plan import decision_automatique
from optiboul.production.domain.plan import heure_validation_auto
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.tasks import valider_plan_auto
from optiboul.users.tests.factories import utilisateur_avec_profil

from .conftest import CE_SOIR
from .conftest import a
from .conftest import plan_passe

PROPOSER = reverse("api:production-proposer")
VALIDER = reverse("api:production-valider")


def test_tolerance_autour_de_la_moyenne():
    assert dans_la_tolerance(4, Decimal("4.0"), 10)
    assert dans_la_tolerance(11, Decimal(10), 10)
    assert not dans_la_tolerance(12, Decimal(10), 10)
    assert not dans_la_tolerance(4, None, 10)
    assert decision_automatique(9, Decimal(10), 10) is StatutPlan.VALIDE
    assert decision_automatique(5, Decimal(10), 10) is StatutPlan.PROVISOIRE


def test_t_moins_15_minutes():
    assert heure_validation_auto(CE_SOIR, time(19)) == a(18, 45)


def _destinataires(genre: str) -> set[str]:
    return set(
        Notification.objects.filter(genre=genre).values_list(
            "destinataire__name",
            flat=True,
        ),
    )


@pytest.fixture
def plan_propose(client_de, responsable_production, commandes_du_soir, heure):
    """Ce soir : 4 sacs proposés à 18:40 (3 BAG, 1 KO)."""
    with heure(18, 40):
        client_de(responsable_production).post(PROPOSER, {}, format="json")
    return PlanProduction.objects.get()


pytestmark = pytest.mark.django_db


def test_validation_par_le_gerant(client_de, gerant, caissiere, plan_propose, heure):
    with heure(18, 42):
        reponse = client_de(gerant).post(VALIDER, {}, format="json")
    assert reponse.status_code == 200, reponse.content
    plan = reponse.json()
    assert (plan["statut"], plan["valide_par"], plan["validation_auto"]) == (
        "valide",
        "Willy",
        False,
    )
    assert plan["heure_validation_auto"] == "2026-10-27T18:45:00+01:00"
    assert _destinataires("plan.valide") == {"Serge", "Rachel", "Willy"}
    assert LigneJournal.objects.get(action="plan.valide").acteur_nom == "Willy"
    with heure(18, 43):
        deja = client_de(gerant).post(VALIDER, {}, format="json")
    assert deja.json()["code"] == "plan_deja_valide"


def test_qui_valide(
    client_de,
    responsable_production,
    proprietaire,
    plan_propose,
    heure,
):
    autre_gerant = utilisateur_avec_profil("gerant", name="Patrick")
    with heure(18, 42):
        assert client_de(responsable_production).post(VALIDER).status_code == 403
        refus = client_de(autre_gerant).post(VALIDER, {}, format="json")
        assert refus.json()["code"] == "droit_insuffisant"
        reponse = client_de(proprietaire).post(VALIDER, {}, format="json")
    assert reponse.json()["valide_par"] == "Fotso"


def test_rien_a_valider(client_de, gerant, s44, heure):
    with heure(18, 42):
        reponse = client_de(gerant).post(VALIDER, {}, format="json")
    assert reponse.json()["code"] == "plan_non_propose"


def test_validation_automatique_dans_la_tolerance(
    responsable_production,
    s44,
    plan_propose,
    heure,
):
    for jours_avant in (1, 2):
        plan_passe(s44, responsable_production, jours_avant, {"BAG": 3, "KO": 1})
    with heure(18, 44):
        assert valider_plan_auto() is None
    with heure(18, 45):
        assert valider_plan_auto() == "valide"
    plan_propose.refresh_from_db()
    assert (plan_propose.statut, plan_propose.validation_auto) == ("valide", True)
    assert plan_propose.valide_par_nom == "Système"
    trace = LigneJournal.objects.get(action="plan.valide")
    assert trace.apres is not None
    assert (trace.apres["moyenne"], trace.apres["tolerance"]) == ("4.0", 10)
    with heure(18, 50):
        assert valider_plan_auto() is None


def test_hors_tolerance_production_provisoire(
    client_de,
    responsable_production,
    gerant,
    proprietaire,
    s44,
    plan_propose,
    heure,
):
    plan_passe(s44, responsable_production, 1, {"BAG": 8})
    with heure(18, 45):
        assert valider_plan_auto() == "provisoire"
    plan_propose.refresh_from_db()
    assert plan_propose.statut == "provisoire"
    assert _destinataires("plan.provisoire") == {"Willy", "Fotso"}
    alerte = Notification.objects.filter(genre="plan.provisoire").first()
    assert alerte is not None
    assert alerte.message == (
        "Sans réponse à T-15 min : 4 sacs, moyenne 8.0, tolérance ±10 %."
    )


def test_tolerance_parametrable(
    client_de,
    proprietaire,
    responsable_production,
    s44,
    plan_propose,
    heure,
):
    plan_passe(s44, responsable_production, 1, {"BAG": 8})
    client_de(proprietaire).put(
        reverse("api:parametre-detail", kwargs={"cle": "tolerance_validation_plan"}),
        {"valeur": 50},
        format="json",
    )
    with heure(18, 45):
        assert valider_plan_auto() == "valide"
