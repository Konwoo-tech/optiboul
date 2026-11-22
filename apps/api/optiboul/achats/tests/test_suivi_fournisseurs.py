"""Bon, réception, manquant, facture et paiement reliés (#351)."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.stocks.infrastructure.models import Matiere

pytestmark = pytest.mark.django_db


@pytest.fixture
def levure_recue(client_de, gerant, s44, minoterie, horloge):
    """Bon de 10 unités de levure, 6 reçues au prix de 1 500 FCFA : 4 manquent."""
    planifiee = ReceptionPlanifiee.objects.create(
        fournisseur=minoterie,
        matiere=Matiere.objects.get(code="levure"),
        quantite=Decimal(10),
        prevue_le=date(2026, 10, 27),
        planifiee_par=gerant,
    )
    reponse = client_de(gerant).post(
        reverse("api:reception-planifiee-receptionner", kwargs={"pk": planifiee.pk}),
        {"quantite": "6", "prix_unitaire": 1_500},
        format="json",
    )
    assert reponse.status_code in {200, 201}, reponse.content
    return planifiee


def test_bon_recu_avec_quantite_receveur_et_date(client_de, gerant, levure_recue):
    bons = client_de(gerant).get(reverse("api:reception-planifiee-list")).json()
    bon = next(b for b in bons["results"] if b["id"] == levure_recue.pk)
    assert bon["reception"] is not None
    assert Decimal(bon["recue_quantite"]) == 6
    assert bon["recue_par"] == "Willy"
    assert bon["recue_le"] is not None


def test_bon_pas_encore_recu(client_de, gerant, minoterie):
    bon = ReceptionPlanifiee.objects.create(
        fournisseur=minoterie,
        matiere=Matiere.objects.get(code="levure"),
        quantite=Decimal(5),
        prevue_le=date(2026, 11, 30),
        planifiee_par=gerant,
    )
    bons = client_de(gerant).get(reverse("api:reception-planifiee-list")).json()
    ligne = next(b for b in bons["results"] if b["id"] == bon.pk)
    assert (ligne["reception"], ligne["recue_quantite"], ligne["recue_par"]) == (
        None,
        None,
        None,
    )


def test_manquant_relie_au_bon_et_au_fournisseur(
    client_de,
    gerant,
    minoterie,
    levure_recue,
):
    manquants = client_de(gerant).get(reverse("api:manquant-list")).json()
    lignes = manquants["results"] if isinstance(manquants, dict) else manquants
    manquant = lignes[0]
    assert manquant["planifiee"] == levure_recue.pk
    assert manquant["fournisseur_id"] == minoterie.pk
    assert Decimal(manquant["quantite"]) == 4


def test_facture_reliee_payee_en_partie_puis_soldee(client_de, gerant, levure_recue):
    client = client_de(gerant)
    facture = FactureFournisseur.objects.get(farine=False)
    url = reverse("api:facture-detail", kwargs={"pk": facture.pk})
    corps = client.get(url).json()
    assert corps["reception_planifiee"] == levure_recue.pk
    assert Decimal(corps["quantite"]) == 6
    assert (corps["montant"], corps["paye"], corps["reste"]) == (9_000, 0, 9_000)
    assert corps["paiement"] is None
    payer = reverse("api:facture-payer", kwargs={"pk": facture.pk})
    client.post(
        payer,
        {"montant": 4_000, "mode": "banque"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="a",
    )
    corps = client.get(url).json()
    assert (corps["statut"], corps["paye"], corps["reste"]) == (
        "en_cours",
        4_000,
        5_000,
    )
    client.post(
        payer,
        {"montant": 5_000, "mode": "mobile", "reference": "MP123"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="b",
    )
    liste = client.get(reverse("api:facture-list")).json()
    soldee = next(f for f in liste["results"] if f["id"] == facture.pk)
    assert (soldee["statut"], soldee["paye"], soldee["reste"]) == ("payee", 9_000, 0)
    assert soldee["paiement"]["mode"] == "mobile"
    assert soldee["paiement"]["reference"] == "MP123"
    assert soldee["paiement"]["depense"] is not None


def test_conditions_en_liste_fermee(client_de, gerant):
    url = reverse("api:fournisseur-list")
    reponse = client_de(gerant).post(
        url,
        {"nom": "Glacière", "conditions": "a_la_livraison", "matieres": ["glace"]},
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["conditions_libelle"] == "À la livraison"
    refus = client_de(gerant).post(
        url,
        {"nom": "Autre", "conditions": "À 30 jours", "matieres": ["glace"]},
        format="json",
    )
    assert refus.status_code == 400


@pytest.mark.parametrize(
    ("texte", "code"),
    [
        ("Lundi", "credit_lundi_mardi"),
        ("Crédit, payé le mardi", "credit_lundi_mardi"),
        ("À 7 jours", "sept_jours"),
        ("Comptant à la livraison", "a_la_livraison"),
        ("À 30 jours", ""),
    ],
)
def test_migration_des_conditions(texte, code):
    from importlib import import_module  # noqa: PLC0415

    migration = import_module("optiboul.achats.migrations.0005_conditions_paiement")
    assert migration.code_de(texte) == code
