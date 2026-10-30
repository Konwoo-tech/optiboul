from datetime import datetime
from datetime import time
from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.conftest import MARDI
from optiboul.core.domain.semaines import FUSEAU
from optiboul.demandes.infrastructure.models import Demande
from optiboul.depenses.application.depenses import valideurs
from optiboul.depenses.infrastructure.autorisations import fin_de_session
from optiboul.depenses.infrastructure.models import Depense
from optiboul.stocks.infrastructure.stocks import stock

DEPENSES = reverse("api:depense-list")


def test_qui_valide_et_quand():
    assert valideurs("caissier") == ("gerant",)
    assert valideurs("production") == ("gerant",)
    assert valideurs("gerant") == ("proprietaire",)
    huit_heures = datetime.combine(MARDI, time(8), tzinfo=FUSEAU)
    assert fin_de_session(huit_heures) == datetime.combine(
        MARDI,
        time(18),
        tzinfo=FUSEAU,
    )


def _depense(client, montant, cle, **champs):
    corps = {
        "categorie": "technique",
        "libelle": "Réparation du pétrin",
        "montant": montant,
        "paye_par": "caisse",
        "rattachement": "production",
    } | champs
    return client.post(DEPENSES, corps, format="json", HTTP_IDEMPOTENCY_KEY=cle)


def _especes(client, caisse) -> int:
    url = reverse("api:caisse-especes", kwargs={"pk": caisse.pk})
    return client.get(url).json()["depenses"]


def _decider(client, demande, action, **corps):
    return client.post(
        reverse(f"api:demande-{action}", kwargs={"pk": demande.pk}),
        corps,
        format="json",
    )


pytestmark = pytest.mark.django_db


def test_depense_de_la_caisse_soumise_au_gerant(
    client_de,
    caissiere,
    gerant,
    caisse_ouverte,
):
    reponse = _depense(client_de(caissiere), 60_000, "a")
    assert reponse.status_code == 201, reponse.content
    assert (reponse.json()["statut"], reponse.json()["demande"]) == (
        "en_attente",
        "DEM-001",
    )
    # La caisse ne paie qu'à l'accord.
    assert _especes(client_de(caissiere), caisse_ouverte) == 0
    demande = Demande.objects.get()
    assert (demande.type, demande.valideurs) == ("depense", ["gerant"])
    assert demande.echeance == datetime.combine(MARDI, time(18), tzinfo=FUSEAU)
    assert (
        _decider(client_de(gerant), demande, "accorder").json()["statut"] == "accordee"
    )
    assert Depense.objects.get().statut == "validee"
    assert _especes(client_de(caissiere), caisse_ouverte) == 60_000


def test_depense_du_gerant_soumise_au_proprietaire(
    client_de,
    gerant,
    proprietaire,
    s44,
    horloge,
):
    reponse = _depense(client_de(gerant), 80_000, "b", paye_par="banque")
    demande = Demande.objects.get()
    assert demande.valideurs == ["proprietaire"]
    assert _decider(client_de(gerant), demande, "accorder").status_code == 403
    refus = _decider(
        client_de(proprietaire),
        demande,
        "refuser",
        motif="Devis trop cher",
    )
    assert refus.json()["statut"] == "refusee"
    assert Depense.objects.get(pk=reponse.json()["id"]).statut == "refusee"


def test_sous_le_seuil_ou_pre_autorisee(client_de, gerant, s44, horloge):
    sous = _depense(client_de(gerant), 40_000, "c", paye_par="banque")
    assert sous.json()["statut"] == "validee"
    client_de(gerant).put(
        reverse("api:pre-autorisation-fixer"),
        {"plafonds": {"bois": 150_000}},
        format="json",
    )
    bois = _depense(
        client_de(gerant),
        100_000,
        "d",
        paye_par="banque",
        achat_courant="bois",
    )
    assert bois.json()["statut"] == "validee"
    assert not Demande.objects.exists()


def test_refus_sans_entree_en_stock(client_de, caissiere, gerant, caisse_ouverte):
    _depense(
        client_de(caissiere),
        55_000,
        "e",
        paye_par="mobile",
        rattachement="stock",
        matiere="huile",
        quantite="20",
        fournisseur="Marché",
    )
    assert stock.quantites()["huile"] == Decimal(0)
    _decider(client_de(gerant), Demande.objects.get(), "refuser", motif="Non")
    assert stock.quantites()["huile"] == Decimal(0)
