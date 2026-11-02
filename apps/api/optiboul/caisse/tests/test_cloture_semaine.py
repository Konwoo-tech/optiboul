"""Clôture de semaine (US-033) avec le contrôle « caisse ouverte » de la caisse."""

from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.application import cloture
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.infrastructure import tasks
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification

pytestmark = pytest.mark.django_db


def _url(s44, nom: str) -> str:
    return reverse(f"api:semaine-{nom}", kwargs={"pk": s44.pk})


@pytest.fixture
def caisse_ouverte(client_de, caissiere, planning_rachel, horloge) -> int:
    reponse = client_de(caissiere).post(reverse("api:caisse-ouvrir"), {"fonds": 20_000})
    return reponse.json()["id"]


def _cloturer(client, s44):
    with mock.patch("optiboul.core.api.semaines.demander_sauvegarde") as sauvegarde:
        reponse = client.post(_url(s44, "cloturer"))
    return reponse, sauvegarde


def test_controles_sans_caisse_ouverte(client_de, gerant, s44):
    controles = client_de(gerant).get(_url(s44, "controles-cloture")).json()
    assert {"cle": "caisse", "niveau": "ok", "detail": ""} in controles


def test_une_caisse_ouverte_bloque_la_cloture(client_de, gerant, s44, caisse_ouverte):
    controles = client_de(gerant).get(_url(s44, "controles-cloture")).json()
    caisse = next(c for c in controles if c["cle"] == "caisse")
    assert caisse["niveau"] == "bloquant"
    assert caisse["session"] == {
        "type": "jour",
        "jour": "2026-10-27",
        "par": "Rachel",
        "heure": "08:00",
    }
    reponse, sauvegarde = _cloturer(client_de(gerant), s44)
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "cloture_bloquee"
    assert "encore ouverte" in reponse.json()["detail"]
    sauvegarde.assert_not_called()
    s44.refresh_from_db()
    assert s44.statut == "ouverte"


def test_cloture_apres_fermeture_des_caisses(
    client_de,
    gerant,
    caissiere,
    s44,
    caisse_ouverte,
):
    with mock.patch("optiboul.caisse.api.caisses.demander_sauvegarde"):
        client_de(caissiere).post(
            reverse("api:caisse-fermer", kwargs={"pk": caisse_ouverte}),
            {"compte": 20_000},
        )
    reponse, sauvegarde = _cloturer(client_de(gerant), s44)
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["statut"] == "cloturee"
    assert reponse.json()["cloturee_par"] == "Willy"
    sauvegarde.assert_called_once_with(Declencheur.CLOTURE_SEMAINE)
    assert LigneJournal.objects.get(action="semaine.cloturee").apres == {
        "statut": "cloturee",
        "a_voir": [],
    }


def test_les_a_voir_n_empechent_pas_et_les_actions_s_executent(
    client_de,
    proprietaire,
    s44,
):
    reportees = []
    cloture.enregistrer_controle(
        "dettes",
        lambda semaine: cloture.Controle(
            "dettes",
            cloture.Niveau.SURVEILLER,
            "2 clients",
        ),
    )
    cloture.enregistrer_action(
        "reporter",
        lambda semaine, auteur: reportees.append(semaine.id),
    )
    try:
        reponse, _ = _cloturer(client_de(proprietaire), s44)
    finally:
        cloture._CONTROLES.pop("dettes")  # noqa: SLF001
        cloture._ACTIONS.pop("reporter")  # noqa: SLF001
    assert reponse.status_code == 200
    assert reportees == [s44.pk]
    trace = LigneJournal.objects.get(action="semaine.cloturee")
    assert trace.apres == {"statut": "cloturee", "a_voir": ["dettes"]}


def test_qui_cloture(client_de, caissiere, s44):
    from optiboul.users.tests.factories import utilisateur_avec_profil  # noqa: PLC0415

    patrick = utilisateur_avec_profil("gerant", name="Patrick")
    assert _cloturer(client_de(patrick), s44)[0].json()["code"] == "droit_insuffisant"
    assert _cloturer(client_de(caissiere), s44)[0].json()["code"] == "droit_insuffisant"


def test_rappel_du_dimanche_au_gerant(gerant, s44, caisse_ouverte):
    assert tasks.rappel_cloture_semaine() == 1
    rappel = Notification.objects.get(genre="semaine.rappel_cloture")
    assert rappel.destinataire == gerant
    assert rappel.titre == "Clôture de la semaine S44"
    assert "encore ouverte" in rappel.message
