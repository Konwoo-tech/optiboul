import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.depenses.infrastructure.models import Depense
from optiboul.paie.infrastructure.models import EtatPaie
from optiboul.paie.infrastructure.models import LignePaie
from optiboul.paie.infrastructure.models import PaiementSalaire

pytestmark = pytest.mark.django_db


@pytest.fixture
def validee(paie, s44):
    EtatPaie.objects.update(statut="valide")
    return paie


def _payer(client, ligne, montant, mode="banque", cle="c1", reference=""):
    return client.post(
        reverse("api:paie-payer-ligne", kwargs={"ligne": ligne.pk}),
        {"montant": montant, "mode": mode, "reference": reference},
        format="json",
        HTTP_IDEMPOTENCY_KEY=cle,
    )


def _payer_tout(client, paie):
    return client.post(
        reverse("api:paie-payer-tout", kwargs={"pk": paie["id"]}),
        {"mode": "banque"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="tout",
    )


def _detail(client, paie):
    return client.get(reverse("api:paie-detail", kwargs={"pk": paie["id"]})).json()


def test_paiement_partiel_cree_la_depense(
    client_de,
    gerant,
    validee,
    ligne_mireille,
    horloge,
):
    client = client_de(gerant)
    reponse = _payer(client, ligne_mireille, 30_000)
    assert reponse.status_code == 201, reponse.content
    depense = Depense.objects.get()
    assert (depense.categorie, depense.montant) == ("salaires", 30_000)
    assert depense.rattachement == "semaine"
    assert LigneJournal.objects.filter(action="paie.salaire_paye").exists()
    detail = _detail(client, validee)
    assert detail["statut"] == "en_paiement"
    ligne = detail["lignes"][0]
    assert (ligne["paye"], ligne["reste"]) == (30_000, 48_000)


def test_rejeu_sans_double_paiement(
    client_de,
    gerant,
    validee,
    ligne_mireille,
    horloge,
):
    client = client_de(gerant)
    _payer(client, ligne_mireille, 30_000)
    _payer(client, ligne_mireille, 30_000)
    assert PaiementSalaire.objects.count() == 1


def test_payer_tous_les_restes(client_de, gerant, validee, ligne_mireille, horloge):
    client = client_de(gerant)
    _payer(client, ligne_mireille, 30_000)
    reponse = _payer_tout(client, validee)
    assert reponse.json() == {"payes": 2}
    assert _detail(client, validee)["statut"] == "payee"
    assert Depense.objects.count() == 3


@pytest.mark.parametrize(
    ("corps", "code"),
    [
        ({"montant": 0}, "montant_invalide"),
        ({"montant": 78_001}, "montant_invalide"),
        ({"montant": 1, "mode": "mobile"}, "reference_obligatoire"),
    ],
)
def test_refus(client_de, gerant, validee, ligne_mireille, horloge, corps, code):
    assert _payer(client_de(gerant), ligne_mireille, **corps).json()["code"] == code


def test_pas_de_paiement_avant_validation(
    client_de,
    gerant,
    paie,
    ligne_mireille,
    horloge,
):
    reponse = _payer(client_de(gerant), ligne_mireille, 1_000)
    assert reponse.json()["code"] == "paie_non_validee"


def test_proprietaire_ne_paie_pas(
    client_de,
    proprietaire,
    validee,
    ligne_mireille,
):
    assert _payer(client_de(proprietaire), ligne_mireille, 1_000).status_code == 403


def test_impaye_repris_le_mois_suivant(
    client_de,
    gerant,
    validee,
    ligne_mireille,
    mireille,
    horloge,
):
    client = client_de(gerant)
    _payer(client, ligne_mireille, 30_000)
    reponse = client.post(
        reverse("api:paie-preparer"),
        {"mois": "2026-11-01"},
        format="json",
    )
    assert reponse.status_code == 201
    suivante = LignePaie.objects.get(etat_id=reponse.json()["id"], employe=mireille)
    assert suivante.impaye == 48_000
    assert EtatPaie.objects.get(pk=validee["id"]).statut == "payee"
    relance = _payer(client, ligne_mireille, 1_000, cle="c2")
    assert relance.json()["code"] == "paie_non_validee"


def test_bulletin_pdf(client_de, gerant, validee, ligne_mireille, horloge):
    client = client_de(gerant)
    _payer(client, ligne_mireille, 30_000)
    url = reverse("api:paie-bulletin", kwargs={"ligne": ligne_mireille.pk})
    reponse = client.get(url)
    assert reponse.status_code == 200
    assert reponse["Content-Type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")
