from datetime import date
from datetime import time
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.conftest import MARDI
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.domain.plan import Demande
from optiboul.production.domain.plan import Rendement
from optiboul.production.domain.plan import ligne
from optiboul.production.domain.plan import moyenne
from optiboul.production.domain.plan import moyennes_par_produit
from optiboul.production.domain.plan import session_de_production
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.users.tests.factories import utilisateur_avec_profil
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Limites
from optiboul.ventes.domain.commandes import Session

from .conftest import a
from .conftest import plan_passe

LIMITES = Limites(time(5, 30), time(18, 30))
BAGUETTE = Rendement(fiche=1, version=1, pains_par_sac=315, pains_par_boule=20)
PLAN = reverse("api:production-plan")
PROPOSER = reverse("api:production-proposer")


@pytest.mark.parametrize(
    ("heure", "minute", "attendue"),
    [
        (5, 29, Session(date(2026, 10, 26), NUIT)),
        (5, 30, Session(MARDI, JOUR)),
        (13, 0, Session(MARDI, JOUR)),
        (18, 30, Session(MARDI, NUIT)),
        (23, 0, Session(MARDI, NUIT)),
    ],
)
def test_session_de_production(heure, minute, attendue):
    assert session_de_production(a(heure, minute), LIMITES) == attendue


def test_ligne_du_plan():
    plan = ligne("BAG", BAGUETTE, Demande(commandes=700), Decimal(3))
    assert (plan.sacs, plan.prevus, plan.boules) == (3, 945, 48)
    vide = ligne("BAG", BAGUETTE, Demande(), None)
    assert (vide.sacs, vide.prevus, vide.boules) == (0, 0, 0)


def test_trois_sources_et_supplement():
    demande = Demande(commandes=700, habituels=300, guichet=30)
    assert demande.estimee == 1_030
    sans = ligne("BAG", BAGUETTE, demande, None)
    assert (sans.base, sans.sacs, sans.besoin, sans.au_dessus_du_plan) == (
        3,
        3,
        1,
        True,
    )
    avec = ligne("BAG", BAGUETTE, demande, None, supplement=1)
    assert (avec.base, avec.sacs, avec.prevus) == (3, 4, 1_260)
    assert (avec.besoin, avec.au_dessus_du_plan) == (0, False)


def test_moyennes_des_dernieres_sessions():
    assert moyennes_par_produit([{"BAG": 3}, {"BAG": 5, "KO": 1}]) == {
        "BAG": Decimal("4.0"),
        "KO": Decimal("0.5"),
    }
    assert moyenne([]) is None
    assert moyenne([3, 4]) == Decimal("3.5")


pytestmark = pytest.mark.django_db


def test_plan_calcule_depuis_les_commandes(
    client_de,
    gerant,
    responsable_production,
    commandes_du_soir,
    s44,
):
    plan_passe(s44, responsable_production, 1, {"BAG": 2})
    plan_passe(s44, responsable_production, 2, {"BAG": 4, "KO": 2})
    plan_passe(s44, responsable_production, 3, {"BAG": 9}, statut="propose")
    reponse = client_de(gerant).get(PLAN, {"jour": "2026-10-27", "creneau": "nuit"})
    assert reponse.status_code == 200, reponse.content
    plan = reponse.json()
    assert plan["statut"] is None
    lignes = {item["code"]: item for item in plan["lignes"]}
    assert lignes["BAG"] == {
        "code": "BAG",
        "version_fiche": 1,
        "pains_par_sac": 315,
        "commandes": 700,
        "habituels": 0,
        "guichet": 0,
        "estimee": 700,
        "base": 3,
        "supplement": 0,
        "besoin": 0,
        "au_dessus_du_plan": False,
        "sacs": 3,
        "prevus": 945,
        "boules": 48,
        "moyenne_sacs": "3.0",
    }
    assert (lignes["KO"]["sacs"], lignes["KO"]["moyenne_sacs"]) == (1, "1.0")
    assert lignes["GC135"]["sacs"] == 0
    # Les plans seulement proposés ne comptent pas dans la comparaison.
    assert (plan["sacs"], plan["moyenne_sacs"], plan["ecart"]) == (4, "4.0", 0)


def test_proposer_le_plan(
    client_de,
    responsable_production,
    gerant,
    proprietaire,
    commandes_du_soir,
    heure,
):
    with heure(18, 45):
        reponse = client_de(responsable_production).post(PROPOSER, {}, format="json")
    assert reponse.status_code == 200, reponse.content
    assert (reponse.json()["jour"], reponse.json()["creneau"]) == ("2026-10-27", "nuit")
    assert reponse.json()["statut"] == "propose"
    plan = PlanProduction.objects.get()
    assert plan.lignes.get(produit__code="BAG").fiche.version == 1
    assert LigneJournal.objects.get(action="plan.propose").apres == {
        "jour": "2026-10-27",
        "creneau": "nuit",
        "sacs": {"BAG": 3, "KO": 1},
        "supplement": {},
        "motif": "",
    }
    prevenus = set(
        Notification.objects.filter(genre="plan.propose").values_list(
            "destinataire__name",
            flat=True,
        ),
    )
    assert prevenus == {"Willy", "Fotso"}


def test_seul_le_responsable_de_la_semaine_propose(
    client_de,
    gerant,
    commandes_du_soir,
    heure,
):
    autre = utilisateur_avec_profil("production", name="Paul")
    with heure(18, 45):
        assert client_de(gerant).post(PROPOSER, {}, format="json").status_code == 403
        reponse = client_de(autre).post(PROPOSER, {}, format="json")
    assert reponse.status_code == 403
    assert reponse.json()["code"] == "droit_insuffisant"


def test_pas_de_plan_sans_commande(client_de, responsable_production, s44, heure):
    with heure(18, 45):
        reponse = client_de(responsable_production).post(PROPOSER, {}, format="json")
    assert reponse.json()["code"] == "plan_vide"
