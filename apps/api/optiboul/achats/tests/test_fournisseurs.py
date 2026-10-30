from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from optiboul.achats.domain.receptions import verifier_planification
from optiboul.achats.infrastructure.models import Fournisseur
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal

FOURNISSEURS = reverse("api:fournisseur-list")
RECEPTIONS = reverse("api:reception-planifiee-list")
MARDI = date(2026, 10, 27)


def test_planification_verifiee():
    verifier_planification(
        matiere="farine",
        matieres_du_fournisseur={"farine"},
        quantite=Decimal(1500),
        prevue_le=MARDI,
        aujourd_hui=MARDI,
    )
    cas: list[tuple[dict[str, Any], str]] = [
        ({"matiere": "sel"}, "matiere_hors_fournisseur"),
        ({"quantite": Decimal(0)}, "quantite_invalide"),
        ({"prevue_le": date(2026, 10, 26)}, "date_passee"),
    ]
    for champs, code in cas:
        valeurs: dict[str, Any] = {
            "matiere": "farine",
            "matieres_du_fournisseur": {"farine"},
            "quantite": Decimal(1500),
            "prevue_le": MARDI,
            "aujourd_hui": MARDI,
        }
        valeurs.update(champs)
        with pytest.raises(RefusMetier) as refus:
            verifier_planification(**valeurs)
        assert refus.value.code == code


@pytest.fixture
def minoterie(db) -> Fournisseur:
    fournisseur = Fournisseur.objects.create(
        nom="Minoterie du Centre",
        conditions="Lundi",
    )
    fournisseur.matieres.set(fournisseur.matieres.model.objects.filter(code="farine"))
    return fournisseur


pytestmark = pytest.mark.django_db


def test_fiche_fournisseur(client_de, gerant, responsable_production):
    corps = {
        "nom": "Levures SA",
        "telephone": "699001122",
        "conditions": "À 30 jours",
        "matieres": ["levure", "ameliorant"],
    }
    assert (
        client_de(responsable_production)
        .post(FOURNISSEURS, corps, format="json")
        .status_code
        == 403
    )
    reponse = client_de(gerant).post(FOURNISSEURS, corps, format="json")
    assert reponse.status_code == 201, reponse.content
    assert sorted(reponse.json()["matieres"]) == ["ameliorant", "levure"]
    assert reponse.json()["prochaine_reception"] is None
    assert (LigneJournal.objects.get(action="fournisseur.cree").apres or {})[
        "matieres"
    ] == [
        "ameliorant",
        "levure",
    ]
    assert client_de(responsable_production).get(FOURNISSEURS).json()["count"] == 1


def test_planifier_une_reception(client_de, gerant, minoterie, horloge):
    corps = {
        "fournisseur": minoterie.pk,
        "matiere": "farine",
        "quantite": "1500",
        "prevue_le": "2026-10-29",
    }
    reponse = client_de(gerant).post(RECEPTIONS, corps, format="json")
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["statut"] == "planifiee"
    assert reponse.json()["planifiee_par"] == "Willy"
    detail = client_de(gerant).get(
        reverse("api:fournisseur-detail", kwargs={"pk": minoterie.pk}),
    )
    assert detail.json()["prochaine_reception"]["prevue_le"] == "2026-10-29"
    hors = client_de(gerant).post(RECEPTIONS, corps | {"matiere": "sel"}, format="json")
    assert hors.json()["code"] == "matiere_hors_fournisseur"
    passee = client_de(gerant).post(
        RECEPTIONS,
        corps | {"prevue_le": "2026-10-20"},
        format="json",
    )
    assert passee.json()["code"] == "date_passee"


def test_annuler(client_de, gerant, minoterie, horloge):
    reponse = client_de(gerant).post(
        RECEPTIONS,
        {
            "fournisseur": minoterie.pk,
            "matiere": "farine",
            "quantite": "50",
            "prevue_le": "2026-10-28",
        },
        format="json",
    )
    url = reverse(
        "api:reception-planifiee-annuler",
        kwargs={"pk": reponse.json()["id"]},
    )
    assert client_de(gerant).post(url).json()["statut"] == "annulee"
    assert client_de(gerant).post(url).json()["code"] == "reception_close"
    assert (
        client_de(gerant).get(RECEPTIONS, {"statut": "planifiee"}).json()["count"] == 0
    )
