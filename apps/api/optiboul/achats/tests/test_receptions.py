from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.achats.domain.receptions import montant_farine
from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import Fournisseur
from optiboul.achats.infrastructure.models import ReceptionPlanifiee
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.stocks.infrastructure.models import Matiere
from optiboul.stocks.infrastructure.stocks import stock


def test_la_farine_se_facture_au_sac():
    assert montant_farine(Decimal(1500), 19_525) == 585_750
    assert montant_farine(Decimal(25), 19_525) == 9_763  # un demi-sac, arrondi


def _planifier(fournisseur, matiere, quantite, gerant) -> ReceptionPlanifiee:
    return ReceptionPlanifiee.objects.create(
        fournisseur=fournisseur,
        matiere=Matiere.objects.get(code=matiere),
        quantite=Decimal(quantite),
        prevue_le=date(2026, 10, 27),
        planifiee_par=gerant,
    )


def _receptionner(client, planifiee, corps):
    return client.post(
        reverse("api:reception-planifiee-receptionner", kwargs={"pk": planifiee.pk}),
        corps,
        format="json",
    )


pytestmark = pytest.mark.django_db


def test_la_farine_de_la_semaine_sur_une_facture(
    client_de,
    gerant,
    responsable_production,
    s44,
    minoterie,
    horloge,
):
    lundi = _planifier(minoterie, "farine", 1500, gerant)
    jeudi = _planifier(minoterie, "farine", 500, gerant)
    reponse = _receptionner(
        client_de(gerant),
        lundi,
        {"quantite": "1450", "observation": "Un sac déchiré"},
    )
    assert reponse.status_code == 201, reponse.content
    recue = reponse.json()
    assert (recue["montant"], recue["ecart"]) == (566_225, "-50.000")
    assert recue["facture"]["farine"] is True
    assert recue["facture"]["echeance"] == "2026-11-03"  # mardi suivant
    deuxieme = _receptionner(
        client_de(responsable_production),
        jeudi,
        {"quantite": "500"},
    )
    assert deuxieme.json()["facture"]["id"] == recue["facture"]["id"]
    facture = FactureFournisseur.objects.get()
    assert facture.montant == 566_225 + 195_250
    assert stock.quantites()["farine"] == Decimal(1950)
    lundi.refresh_from_db()
    assert lundi.statut == "recue"
    trace = LigneJournal.objects.filter(
        action="reception.recue",
        objet_id=str(recue["id"]),
    ).first()
    assert trace is not None
    assert (trace.apres or {})["ecart"] == "-50.000"


def test_autre_matiere_au_prix_saisi(client_de, gerant, s44, horloge):
    levures = Fournisseur.objects.create(nom="Levures SA")
    levures.matieres.set(Matiere.objects.filter(code="levure"))
    planifiee = _planifier(levures, "levure", 5000, gerant)
    sans_prix = _receptionner(client_de(gerant), planifiee, {"quantite": "5000"})
    assert sans_prix.json()["code"] == "prix_obligatoire"
    reponse = _receptionner(
        client_de(gerant),
        planifiee,
        {"quantite": "5000", "prix_unitaire": 5},
    )
    assert reponse.json()["montant"] == 25_000
    assert reponse.json()["facture"]["farine"] is False
    assert reponse.json()["facture"]["echeance"] == "2026-11-03"


def test_refus(client_de, gerant, caissiere, s44, minoterie, horloge):
    planifiee = _planifier(minoterie, "farine", 100, gerant)
    assert (
        _receptionner(client_de(caissiere), planifiee, {"quantite": "100"}).status_code
        == 403
    )
    _receptionner(client_de(gerant), planifiee, {"quantite": "100"})
    deja = _receptionner(client_de(gerant), planifiee, {"quantite": "100"})
    assert deja.json()["code"] == "reception_close"
    factures = client_de(gerant).get(reverse("api:facture-list")).json()
    assert factures["count"] == 1
    assert factures["results"][0]["en_retard"] is False
