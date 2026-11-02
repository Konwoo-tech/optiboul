import re
import time
from datetime import timedelta
from unittest import mock

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import MessageSortant

OUBLIE = reverse("api:connexion-mot-de-passe-oublie")
NOUVEAU = reverse("api:connexion-nouveau-mot-de-passe")

pytestmark = pytest.mark.django_db


def _jeton() -> str:
    contenu = MessageSortant.objects.get(canal="email").contenu
    trouve = re.search(r"jeton=(\S+)", contenu)
    assert trouve is not None
    return trouve.group(1)


def test_lien_par_email_puis_nouveau_mot_de_passe(gerant):
    anonyme = APIClient()
    reponse = anonyme.post(OUBLIE, {"email": gerant.email}, format="json")
    assert reponse.status_code == 204
    message = MessageSortant.objects.get(canal="email")
    assert message.destinataire == gerant.email
    assert "/connexion/nouveau-mot-de-passe?jeton=" in message.contenu
    jeton = _jeton()
    faible = anonyme.post(
        NOUVEAU,
        {"jeton": jeton, "motDePasse": "1234"},
        format="json",
    )
    assert faible.json()["code"] == "mot_de_passe_faible"
    donnees = {"jeton": jeton, "motDePasse": "Pain-de-mie-2026"}
    assert anonyme.post(NOUVEAU, donnees, format="json").status_code == 204
    gerant.refresh_from_db()
    assert gerant.check_password("Pain-de-mie-2026")
    # Usage unique : le même lien ne resert pas.
    deja = anonyme.post(
        NOUVEAU,
        donnees | {"motDePasse": "Autre-pain-2026"},
        format="json",
    )
    assert deja.json()["code"] == "lien_invalide"
    actions = list(
        LigneJournal.objects.filter(action__startswith="mot_de_passe.").values_list(
            "action",
            flat=True,
        ),
    )
    assert sorted(actions) == ["mot_de_passe.demande", "mot_de_passe.reinitialise"]


def test_adresse_inconnue_meme_reponse(db):
    reponse = APIClient().post(OUBLIE, {"email": "personne@gmail.com"}, format="json")
    assert reponse.status_code == 204
    assert not MessageSortant.objects.exists()
    trace = LigneJournal.objects.get(action="mot_de_passe.demande")
    assert trace.apres == {"compte_trouve": False}


def test_lien_limite_a_une_heure(gerant):
    APIClient().post(OUBLIE, {"email": gerant.email}, format="json")
    jeton = _jeton()
    plus_tard = time.time() + timedelta(hours=1, minutes=1).total_seconds()
    with mock.patch("django.core.signing.time.time", return_value=plus_tard):
        reponse = APIClient().post(
            NOUVEAU,
            {"jeton": jeton, "motDePasse": "Pain-de-mie-2026"},
            format="json",
        )
    assert reponse.json()["code"] == "lien_invalide"
