"""Rapport de passation (US-034) avec la section et les incidents de la caisse."""

from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.application.passation import preparer
from optiboul.core.domain.semaines import bornes
from optiboul.core.infrastructure.models import Semaine
from optiboul.core.infrastructure.passation import html
from optiboul.core.infrastructure.passation import produire
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.core.templatetags.optiboul import ESPACE_FINE as F
from optiboul.core.templatetags.optiboul import fcfa
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.notifications.infrastructure.models import Notification
from optiboul.users.tests.factories import utilisateur_avec_profil

pytestmark = pytest.mark.django_db


def test_format_fcfa():
    assert fcfa(20_000) == f"20{F}000{F}FCFA"
    assert fcfa(-1_500) == f"−1{F}500{F}FCFA"  # noqa: RUF001
    assert fcfa(None) == "—"


@pytest.fixture
def semaine_cloturee(client_de, caissiere, gerant, planning_rachel, horloge, s44):
    """Une caisse fermée avec un manque, rouverte puis refermée ; semaine clôturée."""
    client = client_de(caissiere)
    caisse_id = client.post(reverse("api:caisse-ouvrir"), {"fonds": 20_000}).json()[
        "id"
    ]
    fermer = reverse("api:caisse-fermer", kwargs={"pk": caisse_id})
    with mock.patch("optiboul.caisse.api.caisses.demander_sauvegarde"):
        client.post(fermer, {"compte": 18_000})
        client_de(gerant).post(
            reverse("api:caisse-rouvrir", kwargs={"pk": caisse_id}),
            {"motif": "Recompte demandé"},
        )
        client.post(fermer, {"compte": 19_000})
    with (
        mock.patch("optiboul.core.api.semaines.demander_sauvegarde"),
        mock.patch("optiboul.core.api.semaines.taches.passation.delay") as passation,
        mock.patch("django.db.transaction.on_commit", side_effect=lambda f: f()),
    ):
        reponse = client_de(gerant).post(
            reverse("api:semaine-cloturer", kwargs={"pk": s44.pk}),
        )
    assert reponse.status_code == 200, reponse.content
    passation.assert_called_once_with(s44.pk)
    return s44


@pytest.fixture
def s45_patrick(s44):
    patrick = utilisateur_avec_profil("gerant", name="Patrick")
    periode = bornes(2026, 45)
    Semaine.objects.create(
        annee=2026,
        numero=45,
        debut=periode.debut,
        fin=periode.fin,
        gerant=patrick,
    )
    return patrick


def test_le_rapport_reprend_caisses_dettes_stock_et_incidents(
    semaine_cloturee,
    s45_patrick,
):
    contenu = html(preparer(depot_semaines, semaine_cloturee.pk))
    assert "Rapport de passation · semaine S44" in contenu
    assert "Pour Patrick, gérant de la semaine S45." in contenu
    assert "Rachel" in contenu
    assert f"19{F}000{F}FCFA" in contenu
    assert "Écart cumulé" in contenu
    assert f"−1{F}000{F}FCFA" in contenu  # noqa: RUF001
    assert "Réouverture de caisse par Willy" in contenu
    assert "Recompte demandé" in contenu
    # Toutes les sections sont renseignées (#369).
    assert "Non disponible" not in contenu
    assert "Aucune facture fournisseur à payer." in contenu
    assert "Aucune dette client reportée." in contenu


def test_le_pdf_est_envoye_au_gerant_suivant(semaine_cloturee, s45_patrick):
    rapport = produire(semaine_cloturee.pk)
    assert rapport.destinataire == s45_patrick
    with rapport.fichier.open("rb") as fichier:
        assert fichier.read(5) == b"%PDF-"
    notification = Notification.objects.get(genre="semaine.passation")
    assert notification.destinataire == s45_patrick
    assert notification.titre == "Rapport de passation de la semaine S44"
    courriel = MessageSortant.objects.get(
        sujet="OptiBoul · passation de la semaine S44",
    )
    assert courriel.destinataire == s45_patrick.email
    # Rééditer remplace le rapport sans en créer un second.
    assert produire(semaine_cloturee.pk).pk == rapport.pk


def test_telecharger_le_pdf(client_de, semaine_cloturee, proprietaire, caissiere):
    url = reverse("api:semaine-passation", kwargs={"pk": semaine_cloturee.pk})
    reponse = client_de(proprietaire).get(url)
    assert reponse.status_code == 200
    assert reponse["Content-Type"] == "application/pdf"
    assert b"".join(reponse.streaming_content)[:5] == b"%PDF-"
    assert client_de(caissiere).get(url).status_code == 403


def test_pas_de_rapport_avant_la_cloture(client_de, proprietaire, s44):
    url = reverse("api:semaine-passation", kwargs={"pk": s44.pk})
    assert client_de(proprietaire).get(url).json()["code"] == "semaine_non_cloturee"
