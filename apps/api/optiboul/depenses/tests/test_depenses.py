from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.depenses.domain.depenses import Categorie
from optiboul.depenses.domain.depenses import NouvelleDepense
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.domain.depenses import numero_affiche
from optiboul.depenses.domain.depenses import verifier_depense
from optiboul.stocks.infrastructure.stocks import stock

LISTE = reverse("api:depense-list")
BOIS = {
    "categorie": "matieres",
    "libelle": "Bois du four",
    "montant": 15_000,
    "paye_par": "caisse",
    "rattachement": "production",
}


def test_numero_et_controles():
    assert numero_affiche(42) == "DEP-0042"
    achat = NouvelleDepense(
        Categorie.MATIERES,
        "Sel",
        3_000,
        PayePar.CAISSE,
        Rattachement.STOCK,
        matiere="sel",
    )
    with pytest.raises(RefusMetier, match="quantité"):
        verifier_depense(achat, {"sel"})
    with pytest.raises(RefusMetier, match="matière"):
        verifier_depense(achat, set())


def _saisir(client, corps, cle="dep-1", **options):
    return client.post(LISTE, corps, HTTP_IDEMPOTENCY_KEY=cle, **options)


pytestmark = pytest.mark.django_db


def test_depense_payee_par_la_caisse(client_de, caissiere, gerant, caisse_ouverte):
    photo = SimpleUploadedFile(
        "recu.jpg",
        b"\xff\xd8\xff photo",
        content_type="image/jpeg",
    )
    reponse = _saisir(client_de(caissiere), BOIS | {"justificatif": photo})
    assert reponse.status_code == 201, reponse.content
    depense = reponse.json()
    assert (depense["code"], depense["statut"]) == ("DEP-0001", "validee")
    assert depense["caisse"] == caisse_ouverte.pk
    assert (depense["production_jour"], depense["production_creneau"]) == (
        "2026-10-27",
        "jour",
    )
    assert "justificatifs/" in depense["justificatif"]
    assert depense["auteur_profil"] == "caissier"
    especes = client_de(caissiere).get(
        reverse("api:caisse-especes", kwargs={"pk": caisse_ouverte.pk}),
    )
    assert especes.json()["depenses"] == 15_000
    assert (LigneJournal.objects.get(action="depense.saisie").apres or {})[
        "numero"
    ] == "DEP-0001"


def test_achat_qui_entre_en_stock(client_de, gerant, s44, horloge):
    reponse = _saisir(
        client_de(gerant),
        {
            "categorie": "matieres",
            "libelle": "Sel au marché",
            "montant": 3_000,
            "paye_par": "mobile",
            "rattachement": "stock",
            "matiere": "sel",
            "quantite": "5000",
            "fournisseur": "Marché Mokolo",
        },
        format="json",
    )
    assert reponse.status_code == 201, reponse.content
    assert reponse.json()["caisse"] is None
    assert stock.quantites()["sel"] == Decimal(5000)
    sans_fournisseur = _saisir(
        client_de(gerant),
        {
            "categorie": "matieres",
            "libelle": "Sel",
            "montant": 3_000,
            "paye_par": "mobile",
            "rattachement": "stock",
            "matiere": "sel",
            "quantite": "1",
        },
        "dep-2",
        format="json",
    )
    assert sans_fournisseur.json()["code"] == "fournisseur_obligatoire"


def test_frais_generaux_rattaches_a_la_semaine(
    client_de,
    gerant,
    responsable_production,
    s44,
    horloge,
):
    loyer = {
        "categorie": "administration",
        "libelle": "Taxe communale",
        "montant": 25_000,
        "paye_par": "banque",
        "rattachement": "semaine",
    }
    reponse = _saisir(client_de(gerant), loyer, format="json")
    assert reponse.json()["semaine"] == s44.pk
    assert reponse.json()["production_jour"] is None
    refus = _saisir(client_de(responsable_production), loyer, "dep-3", format="json")
    assert refus.json()["code"] == "droit_insuffisant"


def test_qui_voit_quoi(client_de, caissiere, gerant, proprietaire, s44, horloge):
    corps = BOIS | {"paye_par": "banque", "rattachement": "semaine"}
    _saisir(client_de(gerant), corps, format="json")
    assert client_de(caissiere).get(LISTE).json()["count"] == 0
    assert client_de(proprietaire).get(LISTE).json()["count"] == 1
    assert (
        _saisir(client_de(proprietaire), corps, "dep-4", format="json").status_code
        == 403
    )


def test_justificatif_photo_ou_pdf(client_de, gerant, s44, horloge):
    texte = SimpleUploadedFile("notes.txt", b"bonjour", content_type="text/plain")
    corps = BOIS | {"paye_par": "banque", "justificatif": texte}
    reponse = _saisir(client_de(gerant), corps)
    assert reponse.status_code == 400
    assert "justificatif" in reponse.json()
