from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.achats.domain.receptions import StatutFacture
from optiboul.achats.domain.receptions import statut_apres_paiement
from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.depenses.infrastructure.models import Depense
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.stocks import stock


def test_statut_apres_paiement():
    assert statut_apres_paiement(1_000, 0, 400) is StatutFacture.EN_COURS
    assert statut_apres_paiement(1_000, 400, 600) is StatutFacture.PAYEE
    with pytest.raises(RefusMetier) as refus:
        statut_apres_paiement(1_000, 400, 700)
    assert refus.value.autres == {"reste": 600}


@pytest.fixture
def facture(client_de, gerant, s44, minoterie, horloge) -> FactureFournisseur:
    planifiee = ReceptionPlanifiee.objects.create(
        fournisseur=minoterie,
        matiere=Matiere.objects.get(code="farine"),
        quantite=Decimal(500),
        prevue_le=date(2026, 10, 27),
        planifiee_par=gerant,
    )
    client_de(gerant).post(
        reverse("api:reception-planifiee-receptionner", kwargs={"pk": planifiee.pk}),
        {"quantite": "500"},
        format="json",
    )
    return FactureFournisseur.objects.get()


def _payer(client, facture, corps, cle):
    return client.post(
        reverse("api:facture-payer", kwargs={"pk": facture.pk}),
        corps,
        format="json",
        HTTP_IDEMPOTENCY_KEY=cle,
    )


pytestmark = pytest.mark.django_db


def test_paiement_partiel_puis_solde(client_de, gerant, proprietaire, facture):
    assert facture.montant == 195_250
    premier = _payer(
        client_de(gerant),
        facture,
        {"montant": 100_000, "mode": "banque"},
        "a",
    )
    assert premier.status_code == 201, premier.content
    facture.refresh_from_db()
    assert facture.statut == "en_cours"
    depense = Depense.objects.get(pk=premier.json()["depense"])
    assert (depense.categorie, depense.rattachement, depense.montant) == (
        "matieres",
        "stock",
        100_000,
    )
    assert depense.libelle == f"Facture n° {facture.numero} · Minoterie du Centre"
    # La farine est entrée à la réception : pas de seconde entrée au paiement.
    assert stock.quantites()["farine"] == Decimal(500)
    trop = _payer(
        client_de(gerant),
        facture,
        {"montant": 100_000, "mode": "banque"},
        "b",
    )
    assert trop.json()["code"] == "paiement_invalide"
    second = _payer(
        client_de(gerant),
        facture,
        {"montant": 95_250, "mode": "mobile", "reference": "MP-77"},
        "c",
    )
    assert second.status_code == 201
    facture.refresh_from_db()
    assert facture.statut == "payee"
    paiements = client_de(proprietaire).get(
        reverse("api:facture-paiements", kwargs={"pk": facture.pk}),
    )
    assert [p["montant"] for p in paiements.json()] == [95_250, 100_000]
    recu = client_de(proprietaire).get(
        reverse("api:paiement-fournisseur-recu", kwargs={"pk": second.json()["id"]}),
    )
    assert recu["Content-Type"] == "application/pdf"
    assert recu.content.startswith(b"%PDF")


def test_seul_le_gerant_paie(client_de, proprietaire, facture):
    reponse = _payer(
        client_de(proprietaire),
        facture,
        {"montant": 1, "mode": "banque"},
        "x",
    )
    assert reponse.status_code == 403


def test_reference_en_mobile_money(client_de, gerant, facture):
    reponse = _payer(
        client_de(gerant),
        facture,
        {"montant": 1_000, "mode": "mobile"},
        "y",
    )
    assert reponse.json()["code"] == "reference_obligatoire"
