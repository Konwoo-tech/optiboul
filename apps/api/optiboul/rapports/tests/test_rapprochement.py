from datetime import date
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from openpyxl import Workbook

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.rapports.domain.rapprochement import Totaux
from optiboul.rapports.domain.rapprochement import comparer

URL = reverse("api:rapprochement")
MARDI = date(2026, 10, 27)


def test_totaux_identiques():
    cle = ("27/10/2026", "jour")
    assert comparer({cle: Totaux(10, 8)}, {cle: Totaux(10, 8)}) == []


def test_session_absente_et_ecart():
    jour, nuit = ("27/10/2026", "jour"), ("27/10/2026", "nuit")
    ecarts = comparer({jour: Totaux(10, 8)}, {jour: Totaux(10, 9), nuit: Totaux(1, 1)})
    assert [e.creneau for e in ecarts] == ["jour", "nuit"]
    assert ecarts[1].application is None


pytestmark = pytest.mark.django_db


@pytest.fixture
def session(s44, caissiere):
    return Caisse.objects.create(
        semaine=s44,
        jour=MARDI,
        creneau="jour",
        caissiere=caissiere,
        fonds=20_000,
    )


def _excel(*lignes):
    classeur = Workbook()
    feuille = classeur.active
    feuille.append(["jour", "creneau", "ventes", "recette"])
    for ligne in lignes:
        feuille.append(ligne)
    tampon = BytesIO()
    classeur.save(tampon)
    return SimpleUploadedFile("semaine.xlsx", tampon.getvalue())


def _envoyer(client, semaine, fichier):
    return client.post(
        URL,
        {"semaine": semaine.pk, "fichier": fichier},
        format="multipart",
    )


def test_identique(client_de, gerant, s44, session):
    reponse = _envoyer(client_de(gerant), s44, _excel([MARDI, "jour", 0, 0]))
    assert reponse.status_code == 200, reponse.content
    assert reponse.json() == {"identique": True, "ecarts": []}
    assert LigneJournal.objects.filter(action="rapports.rapprochement").exists()


def test_ecart_signale(client_de, gerant, s44, session):
    corps = _envoyer(client_de(gerant), s44, _excel([MARDI, "jour", 500, 0])).json()
    assert corps["identique"] is False
    assert corps["ecarts"][0]["excel"] == {"ventes": 500, "recette": 0}
    assert corps["ecarts"][0]["application"] == {"ventes": 0, "recette": 0}


def test_colonnes_manquantes(client_de, gerant, s44):
    classeur = Workbook()
    classeur.active.append(["jour"])
    tampon = BytesIO()
    classeur.save(tampon)
    fichier = SimpleUploadedFile("x.xlsx", tampon.getvalue())
    reponse = _envoyer(client_de(gerant), s44, fichier)
    assert reponse.json()["code"] == "fichier_invalide"


def test_caissiere_refusee(client_de, caissiere, s44):
    reponse = _envoyer(client_de(caissiere), s44, _excel())
    assert reponse.status_code == 403
