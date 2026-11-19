"""Écran Semaines (#344) : personnes affectables, bilan, contrôles « à voir »."""

from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import Group
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import Fournisseur
from optiboul.achats.infrastructure.models import Reception
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.core.domain.semaines import bornes
from optiboul.core.infrastructure.models import Semaine
from optiboul.demandes.infrastructure.models import Demande
from optiboul.depenses.infrastructure.models import Depense
from optiboul.production.infrastructure.models import LignePlanProduction
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.models import Production
from optiboul.production.infrastructure.models import Produit
from optiboul.production.infrastructure.produits import fiche_en_cours
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.ventes.infrastructure.models import Encaissement

pytestmark = pytest.mark.django_db

PERSONNES = reverse("api:semaine-personnes")


def _bilan(semaine):
    return reverse("api:semaine-bilan", args=[semaine.pk])


def _controles(semaine):
    return reverse("api:semaine-controles-cloture", args=[semaine.pk])


def _caisse(semaine, caissiere, jour, creneau, ecart):
    return Caisse.objects.create(
        semaine=semaine,
        jour=jour,
        creneau=creneau,
        caissiere=caissiere,
        fonds=20_000,
        statut="fermee",
        en_cours=False,
        ecart=ecart,
    )


def _production(semaine, responsable, jour, sacs):
    plan = PlanProduction.objects.create(
        semaine=semaine,
        jour=jour,
        creneau="nuit",
        propose_par=responsable,
    )
    for code, nombre in sacs.items():
        produit = Produit.objects.get(code=code)
        fiche = fiche_en_cours(produit.pk)
        assert fiche is not None
        LignePlanProduction.objects.create(
            plan=plan,
            produit=produit,
            fiche=fiche,
            commandes=0,
            sacs=nombre,
            pains_prevus=nombre * 300,
            boules=0,
        )
    return Production.objects.create(
        plan=plan,
        semaine=semaine,
        statut="cloturee",
        ouverte_par=responsable,
    )


@pytest.fixture
def activite(s44, caissiere, gerant, responsable_production):
    """Semaine 44 : 2 caisses, 3 encaissements, 2 dépenses validées, 2 productions."""
    client = Client.objects.create(nom="Mama Rasta")
    jour = _caisse(s44, caissiere, date(2026, 10, 26), "jour", -1_000)
    nuit = _caisse(s44, caissiere, date(2026, 10, 26), "nuit", 400)
    for caisse, montant in [(jour, 60_000), (jour, 6_200), (nuit, 50_000)]:
        Encaissement.objects.create(
            semaine=s44,
            caisse=caisse,
            client=client,
            mode="especes",
            montant=montant,
            cree_par=caissiere,
        )
    for numero, statut, montant in [
        (1, "validee", 100_000),
        (2, "validee", 60_000),
        (3, "en_attente", 70_000),
        (4, "refusee", 5_000),
    ]:
        Depense.objects.create(
            numero=numero,
            semaine=s44,
            categorie="extra",
            libelle="Essai",
            montant=montant,
            paye_par="caisse",
            rattachement="semaine",
            statut=statut,
            auteur=gerant,
            auteur_profil="gerant",
        )
    _production(s44, responsable_production, date(2026, 10, 26), {"BAG": 4, "KO": 2})
    _production(s44, responsable_production, date(2026, 10, 27), {"BAG": 3})
    fournisseur = Fournisseur.objects.create(nom="Moulin du Centre")
    planifiee = ReceptionPlanifiee.objects.create(
        fournisseur=fournisseur,
        matiere=Matiere.objects.get(code="farine"),
        quantite=Decimal(10),
        prevue_le=date(2026, 10, 27),
        planifiee_par=gerant,
    )
    facture = FactureFournisseur.objects.create(
        numero=41,
        fournisseur=fournisseur,
        semaine=s44,
        montant=195_250,
        echeance=date(2026, 10, 20),
    )
    Reception.objects.create(
        planifiee=planifiee,
        semaine=s44,
        quantite=Decimal(10),
        montant=195_250,
        facture=facture,
        recue_par=gerant,
    )
    return s44


def test_bilan_de_la_semaine(client_de, proprietaire, activite):
    with CaptureQueriesContext(connection) as requetes:
        reponse = client_de(proprietaire).get(_bilan(activite))
    assert reponse.status_code == 200
    assert reponse.json() == {
        "recette": 116_200,
        "depenses": {"nombre": 2, "montant": 160_000},
        "productions": {"nombre": 2, "sacs": 9},
        "ecart_caisse_cumule": -600,
        "caisses": 2,
        "receptions": 1,
    }
    # Session, utilisateur, semaine et six agrégats : rien par ligne.
    assert len(requetes) <= 12


def test_bilan_d_une_semaine_passee_et_vide(client_de, gerant, activite):
    activite.statut = "cloturee"
    activite.save(update_fields=["statut"])
    assert client_de(gerant).get(_bilan(activite)).json()["recette"] == 116_200
    periode = bornes(2026, 45)
    vide = Semaine.objects.create(
        annee=2026,
        numero=45,
        debut=periode.debut,
        fin=periode.fin,
    )
    assert client_de(gerant).get(_bilan(vide)).json() == {
        "recette": 0,
        "depenses": {"nombre": 0, "montant": 0},
        "productions": {"nombre": 0, "sacs": 0},
        "ecart_caisse_cumule": 0,
        "caisses": 0,
        "receptions": 0,
    }
    assert (
        client_de(gerant).get(f"/api/v1/semaines/{vide.pk + 99}/bilan/").status_code
        == 404
    )


@pytest.mark.parametrize(
    "profil",
    ["caissiere", "responsable_production", "administrateur"],
)
def test_bilan_et_personnes_reserves_a_la_direction(client_de, request, s44, profil):
    client = client_de(request.getfixturevalue(profil))
    assert client.get(_bilan(s44)).status_code == 403
    assert client.get(PERSONNES).status_code == 403


def test_personnes_affectables(
    client_de,
    proprietaire,
    gerant,
    caissiere,
    responsable_production,
    django_user_model,
):
    inactive = django_user_model.objects.create_user(
        email="ancienne@optiboul.cm",
        password="x",  # noqa: S106
        name="Ancienne",
        is_active=False,
    )
    inactive.groups.set([Group.objects.get(name="Caisse – équipe de jour")])  # noqa: RUF001
    attendu = {
        "gerants": [{"id": gerant.pk, "nom": "Willy"}],
        "responsables": [
            {"id": responsable_production.pk, "nom": responsable_production.name},
        ],
        "caissieres": [{"id": caissiere.pk, "nom": "Rachel"}],
    }
    assert client_de(proprietaire).get(PERSONNES).json() == attendu
    assert client_de(gerant).get(PERSONNES).json() == attendu


def test_controles_a_voir_factures_et_demandes(client_de, gerant, caissiere, activite):
    for numero in (13, 12):
        Demande.objects.create(
            numero=numero,
            type="plafond",
            objet_type="livraison",
            objet_id=numero,
            objet="Mama Rasta",
            motif="Essai",
            emetteur=caissiere,
            emetteur_nom="Rachel",
            emetteur_profil="caissier",
        )
    controles = {
        c["cle"]: c for c in client_de(gerant).get(_controles(activite)).json()
    }
    assert controles["factures_en_retard"] == {
        "cle": "factures_en_retard",
        "niveau": "surveiller",
        "detail": "1 facture(s) fournisseur en retard, 195250 FCFA.",
        "factures": [
            {
                "id": FactureFournisseur.objects.get(numero=41).pk,
                "numero": "FAC-41",
                "libelle": "Moulin du Centre",
                "montant": 195_250,
                "echeance": "2026-10-20",
            },
        ],
    }
    assert controles["demandes_en_attente"] == {
        "cle": "demandes_en_attente",
        "niveau": "surveiller",
        "detail": "2 demande(s) en attente de décision.",
        "numeros": [12, 13],
    }


def test_controles_ok_sans_retard_ni_attente(client_de, gerant, s44):
    controles = {c["cle"]: c for c in client_de(gerant).get(_controles(s44)).json()}
    assert controles["factures_en_retard"]["niveau"] == "ok"
    assert controles["factures_en_retard"]["factures"] == []
    assert controles["demandes_en_attente"] == {
        "cle": "demandes_en_attente",
        "niveau": "ok",
        "detail": "",
        "numeros": [],
    }
