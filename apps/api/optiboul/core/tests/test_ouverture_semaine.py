from datetime import datetime
from typing import Any
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.domain.semaines import FUSEAU
from optiboul.core.domain.semaines import Statut
from optiboul.core.domain.semaines import raisons_de_ne_pas_ouvrir
from optiboul.core.infrastructure import tasks
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Semaine
from optiboul.notifications.infrastructure.models import Notification
from optiboul.users.tests.factories import utilisateur_avec_profil

LUNDI_6H = datetime(2026, 10, 26, 6, 0, tzinfo=FUSEAU)  # début de S44


def test_conditions_d_ouverture():
    pret: dict[str, Any] = {
        "gerant": 1,
        "production": 2,
        "precedente": Statut.CLOTUREE,
        "autre_ouverte": False,
    }
    assert raisons_de_ne_pas_ouvrir(statut=Statut.PLANIFIEE, **pret) == []
    assert (
        raisons_de_ne_pas_ouvrir(
            statut=Statut.PLANIFIEE,
            **(pret | {"precedente": None}),
        )
        == []
    )
    assert raisons_de_ne_pas_ouvrir(
        statut=Statut.PLANIFIEE,
        gerant=None,
        production=None,
        precedente=Statut.OUVERTE,
        autre_ouverte=True,
    ) == [
        "gerant_manquant",
        "production_manquante",
        "precedente_non_cloturee",
        "autre_semaine_ouverte",
    ]
    assert raisons_de_ne_pas_ouvrir(statut=Statut.OUVERTE, **pret) == ["deja_ouverte"]


@pytest.fixture
def planifier(client_de, proprietaire):
    def _planifier(numero: int, **affectations):
        reponse = client_de(proprietaire).post(
            reverse("api:semaine-list"),
            {
                "annee": 2026,
                "numero": numero,
                **{k: v.pk for k, v in affectations.items()},
            },
            format="json",
        )
        return Semaine.objects.get(pk=reponse.json()["semaine"]["id"])

    return _planifier


def _lundi_6h():
    return mock.patch("django.utils.timezone.now", return_value=LUNDI_6H)


@pytest.mark.django_db
def test_la_semaine_s_ouvre_seule_le_lundi_6h(
    planifier,
    gerant,
    responsable_production,
):
    s43 = planifier(43)
    Semaine.objects.filter(pk=s43.pk).update(statut="cloturee")
    s44 = planifier(44, gerant=gerant, production=responsable_production)
    with _lundi_6h():
        assert tasks.ouvrir_semaine() == s44.pk
    s44.refresh_from_db()
    assert s44.statut == "ouverte"
    assert s44.ouverte_le == LUNDI_6H
    assert s44.ouverte_par is None
    assert LigneJournal.objects.get(action="semaine.ouverte").acteur_nom == "Système"
    # Relancée, la tâche ne fait rien de plus.
    with _lundi_6h():
        assert tasks.ouvrir_semaine() == s44.pk
    assert LigneJournal.objects.filter(action="semaine.ouverte").count() == 1


@pytest.mark.django_db
def test_sinon_alerte_au_proprietaire(planifier, proprietaire, gerant):
    s43 = planifier(43)
    Semaine.objects.filter(pk=s43.pk).update(statut="ouverte")
    planifier(44, gerant=gerant)
    with _lundi_6h():
        assert tasks.ouvrir_semaine() is None
    alerte = Notification.objects.get()
    assert alerte.destinataire == proprietaire
    assert alerte.titre == "La semaine S44 ne s'est pas ouverte"
    assert "Aucun responsable de production" in alerte.message
    assert "précédente n'est pas clôturée" in alerte.message
    trace = LigneJournal.objects.get(action="semaine.ouverture_impossible")
    assert (trace.apres or {})["raisons"] == [
        "production_manquante",
        "precedente_non_cloturee",
        "autre_semaine_ouverte",
    ]


@pytest.mark.django_db
def test_alerte_si_la_semaine_n_est_pas_planifiee(proprietaire):
    with _lundi_6h():
        tasks.ouvrir_semaine()
    assert Notification.objects.get().titre == "La semaine S44 ne s'est pas ouverte"


@pytest.mark.django_db
def test_ouverture_par_le_gerant_affecte(
    client_de,
    planifier,
    gerant,
    responsable_production,
):
    s44 = planifier(44, gerant=gerant, production=responsable_production)
    url = reverse("api:semaine-ouvrir", kwargs={"pk": s44.pk})
    autre = utilisateur_avec_profil("gerant", name="Patrick")
    assert client_de(autre).post(url).json()["code"] == "droit_insuffisant"
    reponse = client_de(gerant).post(url)
    assert reponse.status_code == 200
    assert reponse.json()["statut"] == "ouverte"
    assert reponse.json()["ouverte_par"] == "Willy"
    deuxieme = client_de(gerant).post(url)
    assert deuxieme.status_code == 409
    assert deuxieme.json()["raisons"] == ["deja_ouverte"]


@pytest.mark.django_db
def test_une_seule_semaine_ouverte(
    client_de,
    planifier,
    proprietaire,
    gerant,
    responsable_production,
):
    s43 = planifier(43, gerant=gerant, production=responsable_production)
    s44 = planifier(44, gerant=gerant, production=responsable_production)
    client = client_de(proprietaire)
    client.post(reverse("api:semaine-ouvrir", kwargs={"pk": s43.pk}))
    reponse = client.post(reverse("api:semaine-ouvrir", kwargs={"pk": s44.pk}))
    assert reponse.json()["raisons"] == [
        "precedente_non_cloturee",
        "autre_semaine_ouverte",
    ]
