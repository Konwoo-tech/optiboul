from datetime import date
from datetime import datetime
from datetime import time
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import Relance
from optiboul.conftest import MARDI
from optiboul.conftest import MARDI_8H
from optiboul.core.domain.semaines import FUSEAU
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Limites
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.habitudes import commande_habituelle
from optiboul.ventes.domain.habitudes import est_habituel
from optiboul.ventes.domain.habitudes import rappel_du
from optiboul.ventes.domain.habitudes import sessions_precedentes
from optiboul.ventes.infrastructure.commandes import depot_commandes
from optiboul.ventes.infrastructure.tasks import rappel_habituels

LIMITES = Limites(time(5, 30), time(18, 30))
CE_SOIR = Session(MARDI, NUIT)


def _a(heure: int, minute: int = 0) -> datetime:
    return datetime.combine(MARDI, time(heure, minute), tzinfo=FUSEAU)


def test_sessions_du_meme_type():
    assert sessions_precedentes(CE_SOIR, 2) == [
        Session(date(2026, 10, 26), NUIT),
        Session(date(2026, 10, 25), NUIT),
    ]


def test_habituel_une_session_sur_deux():
    assert est_habituel(2, 4)
    assert not est_habituel(1, 4)
    assert not est_habituel(0, 1)


def test_commande_habituelle_moyenne_arrondie():
    assert commande_habituelle([{"BAG": 300}, {"BAG": 301, "KO": 50}]) == {
        "BAG": 301,
        "KO": 25,
    }
    assert commande_habituelle([]) == {}


def test_rappel_trente_minutes_avant_l_heure_limite():
    assert not rappel_du(_a(17, 59), CE_SOIR, LIMITES, 30)
    assert rappel_du(_a(18), CE_SOIR, LIMITES, 30)
    assert not rappel_du(_a(18, 30), CE_SOIR, LIMITES, 30)


@pytest.fixture
def habitudes(s44, caissiere) -> dict[str, Client]:
    """Rachel commande 3 nuits sur 4, Mama une seule, Raoul a déjà commandé ce soir."""
    clients = {
        nom: Client.objects.create(nom=nom, telephone=telephone)
        for nom, telephone in [("Rachel", "677412018"), ("Mama", ""), ("Raoul", "")]
    }
    passees = [
        ("Rachel", 1, {"BAG": 300}),
        ("Rachel", 2, {"BAG": 310}),
        ("Rachel", 3, {"BAG": 320, "KO": 30}),
        ("Mama", 1, {"BAG": 50}),
        ("Raoul", 1, {"KO": 40}),
        ("Raoul", 2, {"KO": 40}),
        ("Raoul", 0, {"KO": 45}),
    ]
    for nom, jours_avant, lignes in passees:
        depot_commandes.enregistrer(
            semaine=s44.pk,
            client=clients[nom].pk,
            session=Session(date.fromordinal(MARDI.toordinal() - jours_avant), NUIT),
            lignes=lignes,
            apres_heure_limite=False,
            auteur=caissiere.pk,
            le=MARDI_8H,
        )
    return clients


HABITUELS = reverse("api:commande-habituels-sans-commande")


@pytest.mark.django_db
def test_habituels_sans_commande(client_de, caissiere, habitudes, horloge):
    reponse = client_de(caissiere).get(HABITUELS)
    assert reponse.status_code == 200
    assert reponse.json() == [
        {
            "client": {"id": habitudes["Rachel"].pk, "nom": "Rachel"},
            "telephone": "+237 6 •• •• 20 18",
            "commande": {"BAG": 310, "KO": 10},
            "sessions": 3,
            "rappel": None,
        },
    ]


@pytest.mark.django_db
def test_relance_puis_reprise_en_un_clic(client_de, caissiere, habitudes, horloge):
    reponse = client_de(caissiere).post(
        reverse("api:commande-relancer-habituels"),
        {},
        format="json",
    )
    assert [r["statut"] for r in reponse.json()] == ["en_attente"]
    rappel = client_de(caissiere).get(HABITUELS).json()[0]["rappel"]
    assert (rappel["statut"], rappel["automatique"]) == ("en_attente", False)
    reponse = client_de(caissiere).post(
        reverse("api:commande-reprendre-habituelle"),
        {"client": habitudes["Rachel"].pk},
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["lignes"] == {"BAG": 310, "KO": 10}
    assert (reponse.json()["jour"], reponse.json()["creneau"]) == ("2026-10-27", "nuit")
    assert client_de(caissiere).get(HABITUELS).json() == []
    sans_habitude = client_de(caissiere).post(
        reverse("api:commande-reprendre-habituelle"),
        {"client": Client.objects.create(nom="Nouveau").pk},
        format="json",
    )
    assert sans_habitude.json()["code"] == "aucune_habitude"


@pytest.mark.django_db
def test_rappel_automatique_une_fois_par_session(habitudes):
    with mock.patch("django.utils.timezone.now", return_value=_a(17)):
        assert rappel_habituels() == 0
    with mock.patch("django.utils.timezone.now", return_value=_a(18, 5)):
        assert rappel_habituels() == 1
        assert rappel_habituels() == 0
    rappel = Relance.objects.get()
    assert (rappel.motif, rappel.automatique, rappel.jour) == ("commande", True, MARDI)
    assert rappel.message.contenu.startswith(
        "Bonjour Rachel, la Boulangerie du Faubourg prépare la production ce soir.",
    )
    assert rappel.message.contenu.endswith("Répondez avant 18:30.")
