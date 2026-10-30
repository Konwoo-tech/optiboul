from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.infrastructure.models import Demande
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.domain.plan import supplement_faible
from optiboul.production.infrastructure.models import LignePlanProduction
from optiboul.production.infrastructure.models import SupplementProduction
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.models import MouvementStock

SUPPLEMENT = reverse("api:production-supplement")
PLAN = reverse("api:production-plan")


@pytest.mark.parametrize(
    ("sacs", "farine", "attendu"),
    [
        ({"BAG": 1}, Decimal(500), True),
        ({"BAG": 2}, Decimal(500), False),  # plus d'un sac par produit
        ({"BAG": 1, "KO": 1}, Decimal(500), False),  # plus de 10 % du plan
        ({"BAG": 1}, Decimal(10), False),  # farine insuffisante
        ({}, Decimal(500), False),
    ],
)
def test_supplement_faible(sacs, farine, attendu):
    assert (
        supplement_faible(
            sacs,
            sacs_du_plan=10,
            farine_necessaire=Decimal(50) * sum(sacs.values()),
            farine_en_stock=farine,
            seuil_sacs=1,
            seuil_pourcentage=10,
        )
        is attendu
    )


@pytest.fixture
def farine(s44, gerant):
    MouvementStock.objects.create(
        matiere=Matiere.objects.get(code="farine"),
        sens=1,
        quantite=Decimal(500),
        genre="reception",
        source_type="essai",
        source_id=0,
        semaine=s44,
        auteur=gerant,
    )


@pytest.fixture
def seuil_30(client_de, proprietaire):
    """Ce soir le plan compte 4 sacs : 1 sac de plus en fait 25 %."""
    client_de(proprietaire).put(
        reverse("api:parametre-detail", kwargs={"cle": "supplement_auto_pourcentage"}),
        {"valeur": 30},
        format="json",
    )


def _ajouter(client, sacs, motif="habituels"):
    return client.post(SUPPLEMENT, {"supplement": sacs, "motif": motif}, format="json")


def _bag() -> LignePlanProduction:
    return LignePlanProduction.objects.get(produit__code="BAG")


pytestmark = pytest.mark.django_db


def test_accorde_automatiquement_sous_le_seuil(
    client_de,
    responsable_production,
    caissiere,
    gerant,
    plan_valide,
    farine,
    seuil_30,
    heure,
):
    with heure(19, 30):
        assert client_de(gerant).get(PLAN).json()["farine_en_stock"] == "500.000"
        reponse = _ajouter(client_de(responsable_production), {"BAG": 1})
    assert reponse.status_code == 201, reponse.content
    supplement = reponse.json()
    assert (supplement["statut"], supplement["demande"]) == ("auto_accorde", "")
    assert supplement["farine_necessaire"] == "50.000"
    baguette = _bag()
    assert (baguette.supplement, baguette.sacs, baguette.pains_prevus) == (1, 4, 1_260)
    decision = set(
        Notification.objects.filter(genre="supplement.decision").values_list(
            "destinataire__name",
            flat=True,
        ),
    )
    # Le chef et la caisse apprennent la décision ; le gérant est informé.
    assert decision == {"Serge", "Rachel", "Willy"}
    assert LigneJournal.objects.filter(action="supplement.auto_accorde").exists()


def test_au_dela_du_seuil_le_gerant_decide(
    client_de,
    responsable_production,
    gerant,
    plan_valide,
    farine,
    heure,
):
    with heure(19, 30):
        reponse = _ajouter(client_de(responsable_production), {"BAG": 1})
    supplement = reponse.json()
    assert (supplement["statut"], supplement["demande"]) == ("demande", "DEM-001")
    assert _bag().sacs == 3
    demande = Demande.objects.get()
    assert (demande.type, demande.valideurs) == (
        "supplement",
        ["gerant", "proprietaire"],
    )
    assert demande.objet == "Plan de nuit du 27/10 · BAG +1 sac(s)"
    with heure(19, 35):
        client_de(gerant).post(
            reverse("api:demande-accorder", kwargs={"pk": demande.pk}),
            {},
            format="json",
        )
    assert _bag().sacs == 4
    assert SupplementProduction.objects.get().statut == "accorde"


def test_refus_du_gerant(client_de, responsable_production, gerant, plan_valide, heure):
    with heure(19, 30):
        _ajouter(client_de(responsable_production), {"BAG": 1})
        client_de(gerant).post(
            reverse("api:demande-refuser", kwargs={"pk": Demande.objects.get().pk}),
            {"motif": "Farine réservée à demain"},
            format="json",
        )
    assert _bag().sacs == 3
    assert SupplementProduction.objects.get().statut == "refuse"


def test_sans_farine_le_gerant_decide(
    client_de,
    responsable_production,
    plan_valide,
    seuil_30,
    heure,
):
    with heure(19, 30):
        reponse = _ajouter(client_de(responsable_production), {"BAG": 1})
    assert reponse.json()["statut"] == "demande"
    assert reponse.json()["farine_en_stock"] == "0.000"


def test_refus(
    client_de,
    responsable_production,
    commandes_du_soir,
    plan_valide,
    heure,
):
    with heure(19, 30):
        sans_motif = client_de(responsable_production).post(
            SUPPLEMENT,
            {"supplement": {"BAG": 1}},
            format="json",
        )
        assert sans_motif.json()["code"] == "motif_obligatoire"
        vide = _ajouter(client_de(responsable_production), {})
        assert vide.json()["code"] == "supplement_vide"


def test_avant_validation_le_supplement_se_propose(
    client_de,
    responsable_production,
    commandes_du_soir,
    heure,
):
    with heure(18, 40):
        client_de(responsable_production).post(
            reverse("api:production-proposer"),
            {},
            format="json",
        )
        reponse = _ajouter(client_de(responsable_production), {"BAG": 1})
    assert reponse.json()["code"] == "plan_non_valide"
