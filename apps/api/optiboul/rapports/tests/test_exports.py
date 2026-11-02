from datetime import date
from io import BytesIO

import pytest
from django.urls import reverse
from openpyxl import load_workbook

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.rapports.infrastructure.exports import rapport_de_mois

pytestmark = pytest.mark.django_db

MARDI = date(2026, 10, 27)


@pytest.fixture
def session(s44, caissiere):
    return Caisse.objects.create(
        semaine=s44,
        jour=MARDI,
        creneau="jour",
        caissiere=caissiere,
        fonds=20_000,
        ecart=-500,
    )


def test_rapport_du_mois(session):
    rapport = rapport_de_mois(date(2026, 10, 1))
    assert rapport.titre == "Mois 10/2026"
    assert rapport.totaux == (0, 0, 0, -500)


def test_pdf_de_session(client_de, gerant, session):
    reponse = client_de(gerant).get(
        reverse("api:export-session"),
        {"jour": "2026-10-27", "creneau": "jour"},
    )
    assert reponse.status_code == 200
    assert reponse["Content-Type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")
    assert "session-2026-10-27-jour.pdf" in reponse["Content-Disposition"]


def test_excel_de_semaine(client_de, proprietaire, s44, session):
    reponse = client_de(proprietaire).get(
        reverse("api:export-semaine"),
        {"semaine": s44.pk, "format_fichier": "excel"},
    )
    assert reponse.status_code == 200
    feuille = load_workbook(BytesIO(reponse.content)).active
    lignes = list(feuille.values)
    assert lignes[0][0] == "Semaine 44 de 2026"
    assert lignes[2][:2] == ("27/10/2026", "jour")
    assert lignes[-1][0] == "Total"
    assert lignes[-1][-1] == -500


def test_excel_du_mois(client_de, gerant, session):
    reponse = client_de(gerant).get(
        reverse("api:export-mois"),
        {"mois": "2026-10", "format_fichier": "excel"},
    )
    assert reponse.status_code == 200
    assert "mois-2026-10.xlsx" in reponse["Content-Disposition"]


def test_mois_invalide(client_de, gerant):
    reponse = client_de(gerant).get(reverse("api:export-mois"), {"mois": "octobre"})
    assert reponse.status_code == 400


def test_caissiere_refusee(client_de, caissiere):
    reponse = client_de(caissiere).get(reverse("api:export-mois"), {"mois": "2026-10"})
    assert reponse.status_code == 403
