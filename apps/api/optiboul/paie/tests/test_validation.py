from datetime import UTC
from datetime import datetime

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.infrastructure.models import Demande
from optiboul.paie.domain.paie import echeance_validation
from optiboul.paie.infrastructure.models import EtatPaie


def test_echeance_deux_jours_avant_le_jour_de_paie():
    emise = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)
    assert echeance_validation(emise, 28) == datetime(2026, 10, 26, 9, 0, tzinfo=UTC)


def test_echeance_du_mois_suivant_une_fois_passee():
    emise = datetime(2026, 10, 27, 9, 0, tzinfo=UTC)
    assert echeance_validation(emise, 28) == datetime(2026, 11, 26, 9, 0, tzinfo=UTC)


pytestmark = pytest.mark.django_db


def _soumettre(client, paie):
    return client.post(reverse("api:paie-soumettre", kwargs={"pk": paie["id"]}))


def test_soumis_avec_demande_liee(client_de, gerant, proprietaire, paie):
    reponse = _soumettre(client_de(gerant), paie)
    assert reponse.status_code == 200
    assert reponse.json()["demande"].startswith("DEM-")
    assert EtatPaie.objects.get().statut == "soumis"
    demande = Demande.objects.get(type="paie")
    assert demande.objet_id == paie["id"]
    assert LigneJournal.objects.filter(action="paie.soumise").exists()


def test_accord_valide(client_de, gerant, proprietaire, paie):
    _soumettre(client_de(gerant), paie)
    demande = Demande.objects.get(type="paie")
    url = reverse("api:demande-accorder", kwargs={"pk": demande.pk})
    assert client_de(proprietaire).post(url, {}, format="json").status_code == 200
    assert EtatPaie.objects.get().statut == "valide"


def test_refus_rend_le_brouillon(client_de, gerant, proprietaire, paie):
    _soumettre(client_de(gerant), paie)
    demande = Demande.objects.get(type="paie")
    url = reverse("api:demande-refuser", kwargs={"pk": demande.pk})
    reponse = client_de(proprietaire).post(url, {"motif": "À revoir"}, format="json")
    assert reponse.status_code == 200
    assert EtatPaie.objects.get().statut == "brouillon"


def test_pas_deux_soumissions(client_de, gerant, paie):
    client = client_de(gerant)
    _soumettre(client, paie)
    assert _soumettre(client, paie).json()["code"] == "paie_non_brouillon"


def test_proprietaire_ne_soumet_pas(client_de, proprietaire, paie):
    assert _soumettre(client_de(proprietaire), paie).status_code == 403
