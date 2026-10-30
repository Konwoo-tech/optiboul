from unittest import mock

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification

pytestmark = pytest.mark.django_db


def _forcer(client, semaine, corps):
    url = reverse("api:semaine-cloturer-forcee", kwargs={"pk": semaine.pk})
    with mock.patch("optiboul.core.api.semaines.demander_sauvegarde") as sauvegarde:
        reponse = client.post(url, corps, format="json")
    return reponse, sauvegarde


def test_cloture_forcee_avec_caisse_ouverte(
    client_de,
    proprietaire,
    gerant,
    s44,
    caisse_ouverte,
):
    reponse, sauvegarde = _forcer(
        client_de(proprietaire),
        s44,
        {"motif": "Caissière partie sans fermer, coupure de courant"},
    )
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["statut"] == "cloturee"
    assert reponse.json()["cloture_forcee_motif"].startswith("Caissière partie")
    sauvegarde.assert_called_once()
    caisse_ouverte.refresh_from_db()
    assert (caisse_ouverte.statut, caisse_ouverte.en_cours) == ("non_cloturee", False)
    trace = LigneJournal.objects.get(action="semaine.cloturee_forcee")
    assert (trace.apres or {})["non_clotures"] == ["caisse de jour du 27/10"]
    alertes = set(
        Notification.objects.filter(genre="semaine.cloture_forcee").values_list(
            "destinataire__name",
            flat=True,
        ),
    )
    assert alertes == {"Willy", "Fotso"}
    # Plus aucune saisie sur la caisse archivée.
    assert not Caisse.objects.filter(en_cours=True).exists()


def test_reserve_au_proprietaire_avec_motif(client_de, gerant, proprietaire, s44):
    reponse, _ = _forcer(client_de(gerant), s44, {"motif": "x"})
    assert reponse.status_code == 403
    reponse, _ = _forcer(client_de(proprietaire), s44, {"motif": " "})
    assert reponse.status_code == 400
    reponse, _ = _forcer(client_de(proprietaire), s44, {"motif": "Fin de semaine"})
    assert reponse.json()["statut"] == "cloturee"
    reponse, _ = _forcer(client_de(proprietaire), s44, {"motif": "Encore"})
    assert reponse.json()["code"] == "semaine_non_ouverte"
