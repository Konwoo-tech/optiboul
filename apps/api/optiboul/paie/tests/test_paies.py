from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.paie.domain.paie import Calcul
from optiboul.paie.domain.paie import mois_precedent
from optiboul.paie.domain.paie import montant_absences
from optiboul.paie.infrastructure.models import Employe
from optiboul.paie.infrastructure.models import EtatPaie

EMPLOYES = reverse("api:employe-list")
PREPARER = reverse("api:paie-preparer")


def test_une_absence_vaut_base_sur_26():
    assert montant_absences(78_000, Decimal(1)) == 3_000
    assert montant_absences(100_000, Decimal("1.5")) == 5_769


def test_net():
    calcul = Calcul(
        base=100_000,
        absences=3_000,
        avances=10_000,
        penalites=2_000,
        gains=5_000,
        impaye=1_000,
    )
    assert calcul.net == 91_000


def test_mois_precedent():
    assert mois_precedent(date(2026, 1, 1)) == date(2025, 12, 1)


pytestmark = pytest.mark.django_db


def test_fiche_employe(client_de, gerant, proprietaire):
    reponse = client_de(gerant).post(
        EMPLOYES,
        {"nom": "Awa", "poste": "Boulangère", "salaire_base": 60_000},
        format="json",
    )
    assert reponse.status_code == 201
    assert LigneJournal.objects.filter(action="employe.cree").exists()
    assert client_de(proprietaire).get(EMPLOYES).json()["count"] == 1
    refuse = client_de(proprietaire).post(
        EMPLOYES,
        {"nom": "X", "salaire_base": 1},
        format="json",
    )
    assert refuse.status_code == 403


def test_brouillon_precalcule(paie):
    assert paie["statut"] == "brouillon"
    assert paie["mois"] == "2026-10-01"
    assert paie["total_net"] == 178_000
    assert [ligne["employe"] for ligne in paie["lignes"]] == [
        "Mireille Ngo",
        "Paul Atangana",
    ]


def test_employe_inactif_absent(client_de, gerant, mireille):
    Employe.objects.create(nom="Parti", salaire_base=1, actif=False)
    client_de(gerant).post(PREPARER, {"mois": "2026-11-01"}, format="json")
    assert EtatPaie.objects.get().lignes.count() == 1


def test_un_seul_etat_par_mois(client_de, gerant, paie):
    reponse = client_de(gerant).post(PREPARER, {"mois": "2026-10-03"}, format="json")
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "paie_existante"


def _ligne(client, ligne, **corps):
    url = reverse("api:paie-ligne", kwargs={"ligne": ligne.pk})
    return client.put(url, corps, format="json")


def test_absences_et_avances_dans_le_net(client_de, gerant, ligne_mireille):
    reponse = _ligne(
        client_de(gerant),
        ligne_mireille,
        absences="2",
        avances=10_000,
    )
    assert reponse.status_code == 200
    corps = reponse.json()
    assert (corps["montant_absences"], corps["net"]) == (6_000, 62_000)


def test_hors_brouillon_refuse(client_de, gerant, paie, ligne_mireille):
    EtatPaie.objects.update(statut="soumis")
    reponse = _ligne(client_de(gerant), ligne_mireille, absences="1", avances=0)
    assert reponse.json()["code"] == "paie_non_brouillon"


def test_proprietaire_ne_prepare_pas(client_de, proprietaire, mireille):
    reponse = client_de(proprietaire).post(
        PREPARER,
        {"mois": "2026-11-01"},
        format="json",
    )
    assert reponse.status_code == 403


def test_caissiere_refusee(client_de, caissiere):
    assert client_de(caissiere).get(reverse("api:paie-list")).status_code == 403
