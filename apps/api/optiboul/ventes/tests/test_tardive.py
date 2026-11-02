import pytest
from django.urls import reverse

from optiboul.clients.infrastructure.models import Client
from optiboul.conftest import MARDI
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.ventes.domain.commandes import pains_ajoutes

LISTE = reverse("api:commande-list")


def test_pains_ajoutes():
    assert pains_ajoutes(None, {"BAG": 50}) == {"BAG": 50}
    assert pains_ajoutes({"BAG": 50, "KO": 10}, {"BAG": 80, "KO": 5}) == {"BAG": 30}
    assert pains_ajoutes({"BAG": 50}, {"BAG": 40}) == {}


@pytest.fixture
def plan_du_soir(s44, responsable_production):
    def creer(statut: str) -> PlanProduction:
        return PlanProduction.objects.create(
            semaine=s44,
            jour=MARDI,
            creneau="nuit",
            statut=statut,
            propose_par=responsable_production,
        )

    return creer


def _commander(client, client_id: int, lignes: dict[str, int]):
    return client.post(
        LISTE,
        {
            "client": client_id,
            "jour": "2026-10-27",
            "creneau": "nuit",
            "lignes": lignes,
        },
        format="json",
    )


def _prevenus() -> set[str]:
    return set(
        Notification.objects.filter(genre="commande.tardive").values_list(
            "destinataire__name",
            flat=True,
        ),
    )


pytestmark = pytest.mark.django_db


def test_commande_apres_la_validation_du_plan(
    client_de,
    caissiere,
    gerant,
    responsable_production,
    plan_du_soir,
    horloge,
):
    plan_du_soir("valide")
    mama = Client.objects.create(nom="Mama Rasta")
    reponse = _commander(client_de(caissiere), mama.pk, {"BAG": 50})
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["tardive"] is True
    assert _prevenus() == {"Serge", "Willy"}
    alerte = Notification.objects.get(genre="commande.tardive", destinataire=gerant)
    assert alerte.titre == "Commande tardive de Mama Rasta (nuit du 27/10)"
    assert alerte.message == "Après la validation du plan : BAG +50."
    assert (LigneJournal.objects.get(action="commande.saisie").apres or {})["tardive"]


def test_avant_la_validation_rien_a_signaler(
    client_de,
    caissiere,
    plan_du_soir,
    horloge,
):
    plan_du_soir("propose")
    mama = Client.objects.create(nom="Mama Rasta")
    assert (
        _commander(client_de(caissiere), mama.pk, {"BAG": 50}).json()["tardive"]
        is False
    )
    assert not _prevenus()


def test_seul_un_ajout_est_tardif(client_de, caissiere, plan_du_soir, horloge):
    mama = Client.objects.create(nom="Mama Rasta")
    _commander(client_de(caissiere), mama.pk, {"BAG": 50})
    plan_du_soir("provisoire")
    moins = _commander(client_de(caissiere), mama.pk, {"BAG": 40})
    assert moins.json()["tardive"] is False
    plus = _commander(client_de(caissiere), mama.pk, {"BAG": 40, "KO": 20})
    assert plus.json()["tardive"] is True
    messages = Notification.objects.filter(genre="commande.tardive").values_list(
        "message",
        flat=True,
    )
    assert set(messages) == {"Après la validation du plan : KO +20."}
