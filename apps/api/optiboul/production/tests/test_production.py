from decimal import Decimal
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.application.cloture import Niveau
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.domain.production import consommation_theorique
from optiboul.production.domain.production import raisons_de_ne_pas_cloturer
from optiboul.production.domain.production import reste_a_produire
from optiboul.production.infrastructure.cloture import incidents
from optiboul.production.infrastructure.cloture import production_en_cours

from .conftest import plan_passe

OUVRIR = reverse("api:production-ouvrir")
EN_COURS = reverse("api:production-en-cours")
RECETTE = {"farine": Decimal(50), "sel": Decimal(600)}
CONSOMMATION = {
    "farine": "205",
    "sel": "2400",
    "levure": "1800",
    "ameliorant": "1200",
    "glace": "20",
}


def test_pas_de_cloture_sans_realise_ni_consommation():
    assert raisons_de_ne_pas_cloturer(
        planifies={"BAG", "KO"},
        realise={"BAG": 900},
        matieres={"farine", "sel"},
        consommation={"farine": Decimal(200)},
    ) == {"realise_manquant": ["KO"], "consommation_manquante": ["sel"]}
    assert not raisons_de_ne_pas_cloturer(
        planifies={"BAG"},
        realise={"BAG": 0},
        matieres=set(),
        consommation={},
    )


def test_reste_a_produire_et_consommation_theorique():
    assert reste_a_produire({"BAG": 945, "KO": 426}, {"BAG": 960}) == {
        "BAG": 0,
        "KO": 426,
    }
    assert consommation_theorique(
        {"BAG": 3, "KO": 1},
        {"BAG": RECETTE, "KO": RECETTE},
    ) == {
        "farine": Decimal(200),
        "sel": Decimal(2400),
    }


def _url(action: str, production: dict) -> str:
    return reverse(f"api:production-{action}", kwargs={"pk": production["id"]})


pytestmark = pytest.mark.django_db


def test_ouvrir_sur_un_plan_valide(
    client_de,
    responsable_production,
    caissiere,
    gerant,
    plan_valide,
    heure,
):
    with heure(19):
        reponse = client_de(responsable_production).post(OUVRIR, {}, format="json")
        assert reponse.status_code == 200, reponse.content
        production = reponse.json()
        assert (production["statut"], production["prevus"], production["reste"]) == (
            "en_cours",
            1_371,
            1_371,
        )
        deja = client_de(responsable_production).post(OUVRIR, {}, format="json")
    assert deja.json()["code"] == "production_deja_ouverte"
    prevenus = set(
        Notification.objects.filter(genre="production.ouverte").values_list(
            "destinataire__name",
            flat=True,
        ),
    )
    assert prevenus == {"Willy", "Rachel"}
    assert LigneJournal.objects.get(action="production.ouverte").apres == {
        "jour": "2026-10-27",
        "creneau": "nuit",
        "plan": "valide",
    }


def test_pas_d_ouverture_sans_plan_valide(
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
        reponse = client_de(responsable_production).post(OUVRIR, {}, format="json")
    assert reponse.json()["code"] == "plan_non_valide"


def test_realise_par_fournee_et_reste_a_produire(
    client_de,
    responsable_production,
    caissiere,
    production,
    heure,
):
    url = _url("fournee", production)
    with heure(21):
        client_de(responsable_production).post(url, {"produit": "BAG", "pains": 500})
        reponse = client_de(responsable_production).post(
            url,
            {"produit": "BAG", "pains": 400},
            format="json",
        )
        baguette = next(p for p in reponse.json()["produits"] if p["code"] == "BAG")
        assert (baguette["prevus"], baguette["realise"], baguette["reste"]) == (
            945,
            900,
            45,
        )
        hors_plan = client_de(responsable_production).post(
            url,
            {"produit": "XXL", "pains": 5},
            format="json",
        )
        assert hors_plan.json()["code"] == "produit_hors_plan"
        # La caisse voit le reste à produire, sans rien saisir.
        vu = client_de(caissiere).get(EN_COURS)
        assert vu.json()["reste"] == 45 + 426
        assert (
            client_de(caissiere).post(url, {"produit": "BAG", "pains": 1}).status_code
            == 403
        )


def test_consommation_avec_valeur_theorique(
    client_de,
    responsable_production,
    production,
    heure,
):
    with heure(22):
        reponse = client_de(responsable_production).put(
            _url("consommation", production),
            {"quantites": {"farine": "205", "sel": "2400"}},
            format="json",
        )
    assert reponse.status_code == 200, reponse.content
    par_matiere = {c["matiere"]: c for c in reponse.json()["consommation"]}
    assert par_matiere["farine"] == {
        "matiere": "farine",
        "theorique": "200.000",
        "reelle": "205.000",
        "justification": "",
    }
    assert par_matiere["levure"]["reelle"] is None
    assert par_matiere["levure"]["theorique"] == "1800.000"


def test_cloture(
    client_de,
    responsable_production,
    gerant,
    proprietaire,
    production,
    s44,
    heure,
):
    cloturer = _url("cloturer", production)
    semaine = depot_semaines.obtenir(s44.pk)
    assert semaine is not None
    # R3 : la semaine ne se clôture pas avec une production en cours.
    assert production_en_cours(semaine).niveau is Niveau.BLOQUANT
    with heure(23):
        refus = client_de(responsable_production).post(cloturer)
        assert refus.status_code == 409
        assert refus.json()["code"] == "cloture_impossible"
        assert refus.json()["manquants"]["realise_manquant"] == ["BAG", "KO"]
        for code, pains in [("BAG", 960), ("KO", 420)]:
            client_de(responsable_production).post(
                _url("fournee", production),
                {"produit": code, "pains": pains},
                format="json",
            )
        client_de(responsable_production).put(
            _url("consommation", production),
            {"quantites": CONSOMMATION},
            format="json",
        )
        with mock.patch(
            "optiboul.production.api.plans.demander_sauvegarde",
        ) as sauvegarde:
            reponse = client_de(responsable_production).post(cloturer)
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["statut"] == "cloturee"
    sauvegarde.assert_called_once_with(Declencheur.CLOTURE_PRODUCTION)
    assert LigneJournal.objects.get(action="production.cloturee").apres == {
        "statut": "cloturee",
        "prevus": 1_371,
        "realise": 1_380,
        "sorties": {
            "farine": "205.000",
            "sel": "2400.000",
            "levure": "1800.000",
            "ameliorant": "1200.000",
            "glace": "20.000",
        },
    }
    assert Notification.objects.filter(genre="production.cloturee").count() == 2
    assert production_en_cours(semaine).niveau is Niveau.OK
    with heure(23, 30):
        apres = client_de(responsable_production).post(
            _url("fournee", production),
            {"produit": "BAG", "pains": 1},
            format="json",
        )
    assert apres.json()["code"] == "production_cloturee"


def test_incidents_de_passation(responsable_production, s44):
    plan_passe(s44, responsable_production, 1, {"BAG": 3}, statut="provisoire")
    semaine = depot_semaines.obtenir(s44.pk)
    assert semaine is not None
    assert incidents(semaine) == ["Production de nuit du 26/10 démarrée provisoire"]
