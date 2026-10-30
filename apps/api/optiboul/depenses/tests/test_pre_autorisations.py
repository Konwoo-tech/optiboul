import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.depenses.domain.depenses import dans_la_pre_autorisation
from optiboul.depenses.infrastructure.models import Depense

PRE = reverse("api:pre-autorisation-list")
FIXER = reverse("api:pre-autorisation-fixer")
DEPENSES = reverse("api:depense-list")


def test_dans_le_cadre_de_la_semaine():
    assert dans_la_pre_autorisation(150_000, 100_000, 50_000)
    assert not dans_la_pre_autorisation(150_000, 100_000, 50_001)


def _bois(client, montant, cle):
    return client.post(
        DEPENSES,
        {
            "categorie": "matieres",
            "libelle": "Bois du four",
            "montant": montant,
            "paye_par": "banque",
            "rattachement": "production",
            "achat_courant": "bois",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=cle,
    )


pytestmark = pytest.mark.django_db


def test_plafond_par_categorie(client_de, gerant, caissiere, s44, horloge):
    assert (
        client_de(caissiere)
        .put(FIXER, {"plafonds": {"bois": 1}}, format="json")
        .status_code
        == 403
    )
    reponse = client_de(gerant).put(
        FIXER,
        {"plafonds": {"bois": 150_000, "levure": 20_000}},
        format="json",
    )
    assert reponse.status_code == 200, reponse.content
    assert {p["achat_courant"]: p["plafond"] for p in reponse.json()} == {
        "bois": 150_000,
        "levure": 20_000,
    }
    assert LigneJournal.objects.get(action="pre_autorisations.fixees").apres == {
        "bois": 150_000,
        "levure": 20_000,
    }
    inconnu = client_de(gerant).put(FIXER, {"plafonds": {"farine": 1}}, format="json")
    assert inconnu.json()["code"] == "achat_courant_inconnu"


def test_depenses_dans_le_cadre(client_de, gerant, caissiere, s44, horloge):
    client_de(gerant).put(FIXER, {"plafonds": {"bois": 150_000}}, format="json")
    premiere = _bois(client_de(gerant), 100_000, "a")
    assert premiere.json()["pre_autorisation"] is not None
    seconde = _bois(client_de(gerant), 60_000, "b")
    # Au-delà du reste (50 000 FCFA), la dépense n'est plus couverte.
    assert seconde.json()["pre_autorisation"] is None
    bois = client_de(caissiere).get(PRE).json()[0]
    assert (bois["engage"], bois["reste"]) == (100_000, 50_000)
    assert Depense.objects.filter(pre_autorisation__isnull=False).count() == 1
