from datetime import date

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.infrastructure.models import CreneauPlanning
from optiboul.paie.domain.paie import absences_proposees

LUNDI = date(2026, 10, 26)
MARDI = date(2026, 10, 27)
MERCREDI = date(2026, 10, 28)


def test_un_jour_compte_une_fois_et_le_jour_meme_attend():
    planifies = {
        (LUNDI, "jour"),
        (LUNDI, "nuit"),
        (MARDI, "jour"),
        (MERCREDI, "jour"),
    }
    ouverts = {(MARDI, "jour")}
    assert absences_proposees(planifies, ouverts, MERCREDI) == [LUNDI]


pytestmark = pytest.mark.django_db


@pytest.fixture
def lignes(s44, caissiere, paie, mireille):
    mireille.utilisateur = caissiere
    mireille.save()
    for jour in (LUNDI, MARDI):
        CreneauPlanning.objects.create(
            semaine=s44,
            jour=jour,
            creneau="jour",
            caissiere=caissiere,
        )
    Caisse.objects.create(
        semaine=s44,
        jour=MARDI,
        creneau="jour",
        caissiere=caissiere,
        fonds_ouverture=20_000,
        ouverte_par=caissiere,
    )


def test_proposees_depuis_le_planning(client_de, gerant, paie, lignes, horloge):
    url = reverse("api:paie-absences-proposees", kwargs={"pk": paie["id"]})
    corps = client_de(gerant).get(url).json()
    assert len(corps) == 1
    assert corps[0]["employe"] == "Mireille Ngo"
    assert corps[0]["jours"] == ["2026-10-26"]
    assert corps[0]["saisies"] == "0.0"


def test_a_confirmer_ou_corriger(client_de, gerant, paie, lignes, ligne_mireille, horloge):
    client = client_de(gerant)
    url = reverse("api:paie-ligne", kwargs={"ligne": ligne_mireille.pk})
    client.put(url, {"absences": "1", "avances": 0}, format="json")
    proposees = reverse("api:paie-absences-proposees", kwargs={"pk": paie["id"]})
    assert client.get(proposees).json()[0]["saisies"] == "1.0"
    ligne_mireille.refresh_from_db()
    assert ligne_mireille.absences == 1
