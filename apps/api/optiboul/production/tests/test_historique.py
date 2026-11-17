"""Historique des productions, jalons du cycle et correction d'une fournée (#331)."""

from datetime import date

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.production.infrastructure.models import Fournee
from optiboul.production.infrastructure.models import Production
from optiboul.production.infrastructure.models import Produit

from .conftest import plan_passe

pytestmark = pytest.mark.django_db

LISTE = reverse("api:production-list")
RESTE = reverse("api:production-reste-a-produire")
PLAN = reverse("api:production-plan")


def _fournee(client, production, code, pains):
    return client.post(
        reverse("api:production-fournee", kwargs={"pk": production["id"]}),
        {"produit": code, "pains": pains},
        format="json",
    )


def _annuler(client, production, numero):
    return client.delete(
        reverse(
            "api:production-fournee-annuler",
            kwargs={"pk": production["id"], "numero": numero},
        ),
    )


def _production_passee(s44, responsable, jours_avant, statut="cloturee"):
    plan = plan_passe(s44, responsable, jours_avant, {"BAG": 2})
    return Production.objects.create(
        plan=plan,
        semaine=s44,
        statut=statut,
        ouverte_par=responsable,
    )


def test_jalons_du_plan_et_de_la_production(
    client_de,
    responsable_production,
    gerant,
    production,
    heure,
):
    with heure(19, 5):
        plan = client_de(gerant).get(PLAN).json()
    assert plan["propose_par"] == responsable_production.name
    assert plan["propose_le"] == "2026-10-27T18:40:00+01:00"
    assert plan["valide_par"] == gerant.name
    assert production["ouverte_par"] == responsable_production.name
    assert production["ouverte_le"] == "2026-10-27T19:00:00+01:00"
    assert (production["cloturee_par"], production["cloturee_le"]) == ("", None)
    assert production["tolerance_ecart_kg"] == 2
    assert production["tolerance_ecart_pourcent"] == 4


def test_plan_pas_encore_propose(client_de, gerant, s44, heure):
    with heure(18, 35):
        plan = client_de(gerant).get(PLAN).json()
    assert (plan["propose_par"], plan["propose_le"]) == ("", None)


def test_liste_des_productions_de_la_semaine(
    client_de,
    responsable_production,
    gerant,
    production,
    s44,
    heure,
):
    passee = _production_passee(s44, responsable_production, jours_avant=1)
    with heure(19, 30):
        _fournee(client_de(responsable_production), production, "BAG", 315)
        reponse = client_de(gerant).get(LISTE, {"semaine": s44.pk})
    assert reponse.status_code == 200, reponse.content
    page = reponse.json()
    assert page["count"] == 2
    # La plus récente d'abord.
    assert [p["id"] for p in page["results"]] == [production["id"], passee.pk]
    ligne = page["results"][0]
    assert ligne == {
        "id": production["id"],
        "jour": "2026-10-27",
        "creneau": "nuit",
        "statut": "en_cours",
        "responsable": {
            "id": responsable_production.pk,
            "nom": responsable_production.name,
        },
        "plan_valide_par": gerant.name,
        "ouverte_le": "2026-10-27T19:00:00+01:00",
        "cloturee_le": None,
        "sacs": production["produits"][0]["sacs"] + production["produits"][1]["sacs"],
        "prevus": production["prevus"],
        "realise": 315,
        "ecart_matiere_kg": None,
        "motif_ecart": "",
    }
    assert page["results"][1]["realise"] == 0


def test_filtre_par_semaine(client_de, gerant, production, heure):
    with heure(19, 30):
        autre = client_de(gerant).get(LISTE, {"semaine": 999_999}).json()
        invalide = client_de(gerant).get(LISTE, {"semaine": "x"})
    assert autre["count"] == 0
    assert invalide.status_code == 400


def test_ecart_de_farine_et_son_motif(
    client_de,
    responsable_production,
    gerant,
    production,
    heure,
):
    theorique = next(
        m["theorique"] for m in production["consommation"] if m["matiere"] == "farine"
    )
    reelle = float(theorique) + 30
    with heure(20):
        reponse = client_de(responsable_production).put(
            reverse("api:production-consommation", kwargs={"pk": production["id"]}),
            {
                "quantites": {"farine": str(reelle)},
                "justifications": {"farine": "perte"},
            },
            format="json",
        )
        assert reponse.status_code == 200, reponse.content
        ligne = client_de(gerant).get(LISTE).json()["results"][0]
    assert (ligne["ecart_matiere_kg"], ligne["motif_ecart"]) == ("30.000", "perte")


def test_droits_de_lecture_de_la_liste(
    client_de,
    responsable_production,
    proprietaire,
    caissiere,
    production,
):
    assert client_de(responsable_production).get(LISTE).status_code == 200
    assert client_de(proprietaire).get(LISTE).status_code == 200
    assert client_de(caissiere).get(LISTE).status_code == 403


def test_liste_sans_requete_par_ligne(
    client_de,
    responsable_production,
    gerant,
    production,
    s44,
):
    client = client_de(gerant)
    client.get(LISTE)
    with CaptureQueriesContext(connection) as une:
        client.get(LISTE)
    _production_passee(s44, responsable_production, jours_avant=1)
    _production_passee(s44, responsable_production, jours_avant=2)
    with CaptureQueriesContext(connection) as trois:
        assert client.get(LISTE).json()["count"] == 3
    assert len(trois) == len(une)


def test_annuler_la_derniere_fournee(
    client_de,
    responsable_production,
    production,
    heure,
):
    chef = client_de(responsable_production)
    with heure(19, 30):
        _fournee(chef, production, "BAG", 315)
    with heure(19, 45):
        _fournee(chef, production, "BAG", 3150)
        reste = chef.get(RESTE).json()
        assert [(f["numero"], f["pains"]) for f in reste["fournees"]] == [
            (2, 3150),
            (1, 315),
        ]
        reponse = _annuler(chef, production, 2)
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["realise"] == 315
    # Pas effacée : annulée, et tracée.
    annulee = Fournee.toutes.get(pains=3150)
    assert annulee.annulee_par == responsable_production
    assert Fournee.objects.filter(production_id=production["id"]).count() == 1
    ligne = LigneJournal.objects.get(action="production.fournee_annulee")
    assert ligne.avant == {"numero": 2, "produit": "BAG", "pains": 3150}
    with heure(19, 50):
        reste = chef.get(RESTE).json()
        # La suivante reprend le numéro libéré.
        _fournee(chef, production, "KO", 426)
        assert chef.get(RESTE).json()["fournees"][0]["numero"] == 2
    assert [f["numero"] for f in reste["fournees"]] == [1]


def test_seule_la_derniere_fournee_s_annule(
    client_de,
    responsable_production,
    production,
    heure,
):
    chef = client_de(responsable_production)
    with heure(19, 30):
        _fournee(chef, production, "BAG", 315)
        _fournee(chef, production, "KO", 426)
        premiere = _annuler(chef, production, 1)
        inconnue = _annuler(chef, production, 3)
    assert premiere.status_code == 409
    assert premiere.json()["code"] == "fournee_pas_la_derniere"
    assert premiere.json()["derniere"] == 2
    assert inconnue.status_code == 404
    assert inconnue.json()["code"] == "fournee_inconnue"


def test_droits_de_la_correction(
    client_de,
    responsable_production,
    gerant,
    production,
    heure,
):
    with heure(19, 30):
        _fournee(client_de(responsable_production), production, "BAG", 315)
        assert _annuler(client_de(gerant), production, 1).status_code == 403
    Production.objects.filter(pk=production["id"]).update(statut="cloturee")
    with heure(20):
        cloturee = _annuler(client_de(responsable_production), production, 1)
    assert cloturee.status_code == 409
    assert cloturee.json()["code"] == "production_cloturee"


def test_fiche_produit_cuisson_et_mois_precedent(
    client_de,
    responsable_production,
    proprietaire,
    production,
    heure,
):
    with heure(19, 30):
        _fournee(client_de(responsable_production), production, "BAG", 315)
    baguette = Produit.objects.get(code="BAG")
    url = reverse("api:produit-detail", kwargs={"pk": baguette.pk})
    with heure(10, jour=date(2026, 11, 3)):
        reponse = client_de(proprietaire).patch(
            url,
            {"cuisson_minutes": 24},
            format="json",
        )
        assert reponse.status_code == 200, reponse.content
        lue = client_de(responsable_production).get(url).json()
        liste = client_de(responsable_production).get(reverse("api:produit-list"))
    assert (lue["cuisson_minutes"], lue["pains_produits_mois_precedent"]) == (24, 315)
    kirikou = next(p for p in liste.json()["results"] if p["code"] == "KO")
    assert (kirikou["cuisson_minutes"], kirikou["pains_produits_mois_precedent"]) == (
        None,
        0,
    )
    with heure(10, jour=date(2026, 12, 3)):
        assert (
            client_de(proprietaire).get(url).json()["pains_produits_mois_precedent"]
            == 0
        )
