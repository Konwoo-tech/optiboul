import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.depenses.domain.depenses import StatutBudget
from optiboul.depenses.domain.depenses import part_du_budget
from optiboul.depenses.domain.depenses import statut_budget

BUDGETS = reverse("api:budget-list")
FIXER = reverse("api:budget-fixer")


@pytest.mark.parametrize(
    ("depense", "budget", "statut"),
    [
        (0, 100_000, StatutBudget.OK),
        (79_999, 100_000, StatutBudget.OK),
        (80_000, 100_000, StatutBudget.SURVEILLER),
        (100_000, 100_000, StatutBudget.SURVEILLER),
        (100_001, 100_000, StatutBudget.DEPASSE),
        (1, 0, StatutBudget.DEPASSE),
        (0, 0, StatutBudget.OK),
    ],
)
def test_statut_du_budget(depense, budget, statut):
    assert statut_budget(depense, budget, 80) is statut


def test_part_du_budget():
    assert part_du_budget(85_000, 100_000) == 85
    assert part_du_budget(1, 0) is None


def _depenser(client, categorie, montant, cle):
    return client.post(
        reverse("api:depense-list"),
        {
            "categorie": categorie,
            "libelle": "Facture",
            "montant": montant,
            "paye_par": "banque",
            "rattachement": "semaine",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=cle,
    )


pytestmark = pytest.mark.django_db


def test_budget_du_mois(client_de, gerant, proprietaire, s44, horloge):
    assert (
        client_de(gerant)
        .put(FIXER, {"mois": "2026-10", "montants": {}}, format="json")
        .status_code
        == 403
    )
    reponse = client_de(proprietaire).put(
        FIXER,
        {"mois": "2026-10", "montants": {"technique": 100_000, "electricite": 10_000}},
        format="json",
    )
    assert reponse.status_code == 200, reponse.content
    for categorie, montant, cle in [
        ("technique", 45_000, "a"),
        ("technique", 40_000, "b"),
        ("electricite", 20_000, "c"),
    ]:
        _depenser(client_de(gerant), categorie, montant, cle)
    budget = client_de(gerant).get(BUDGETS, {"mois": "2026-10"}).json()
    lignes = {ligne["categorie"]: ligne for ligne in budget["lignes"]}
    assert (lignes["technique"]["part"], lignes["technique"]["statut"]) == (
        85,
        "surveiller",
    )
    assert lignes["electricite"]["statut"] == "depasse"
    assert lignes["eau"] == {
        "categorie": "eau",
        "libelle": "Eau",
        "budget": 0,
        "depense": 0,
        "part": None,
        "statut": "ok",
    }
    assert (budget["budget"], budget["depense"]) == (110_000, 105_000)
    assert LigneJournal.objects.get(action="budget.fixe").apres == {
        "technique": 100_000,
        "electricite": 10_000,
    }
    autre_mois = client_de(gerant).get(BUDGETS, {"mois": "2026-11"}).json()
    assert autre_mois["depense"] == 0


def test_mois_invalide(client_de, proprietaire):
    assert client_de(proprietaire).get(BUDGETS, {"mois": "2026-13"}).status_code == 400
    reponse = client_de(proprietaire).put(
        FIXER,
        {"mois": "2026-10", "montants": {"loisirs": 1}},
        format="json",
    )
    assert reponse.status_code == 400
