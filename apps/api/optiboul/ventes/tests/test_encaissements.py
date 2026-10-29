import pytest
from django.db import IntegrityError
from django.db import transaction
from django.urls import reverse

from optiboul.clients.infrastructure.models import MouvementCompte
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.ventes.domain.encaissements import ModePaiement
from optiboul.ventes.domain.encaissements import Paiement
from optiboul.ventes.domain.encaissements import verifier_paiement
from optiboul.ventes.infrastructure.models import Encaissement
from optiboul.ventes.infrastructure.models import Livraison

from .test_livraisons import livrer

ENCAISSEMENTS = reverse("api:encaissement-list")


def test_reference_obligatoire_en_mobile_money():
    with pytest.raises(RefusMetier) as refus:
        verifier_paiement(Paiement(ModePaiement.MTN, 1_000, "  "))
    assert refus.value.code == "reference_obligatoire"
    paye = verifier_paiement(Paiement(ModePaiement.ORANGE, 1_000, " OM-123 "))
    assert paye.reference == "OM-123"
    assert verifier_paiement(Paiement(ModePaiement.ESPECES, 500)).reference == ""
    with pytest.raises(RefusMetier, match="positif"):
        verifier_paiement(Paiement(ModePaiement.ESPECES, 0))


def _especes(client_de, caissiere, caisse) -> int:
    url = reverse("api:caisse-especes", kwargs={"pk": caisse.pk})
    return client_de(caissiere).get(url).json()["especes"]


pytestmark = pytest.mark.django_db


def test_paiement_partiel_en_especes(client_de, caissiere, caisse, rachel_boutique):
    reponse = livrer(
        client_de(caissiere),
        {
            "client": rachel_boutique.pk,
            "lignes": {"BAG": 100, "KO": 10},
            "paiement": {"mode": "especes", "montant": 5_000},
        },
    )
    assert reponse.status_code == 201, reponse.content
    livraison = reponse.json()
    assert livraison["montant_du"] == 10_200
    assert livraison["recu"] == 5_000
    assert livraison["reste"] == -5_200
    assert livraison["solde_apres"] == -5_200
    assert livraison["paiements"] == [
        {"mode": "especes", "montant": 5_000, "reference": ""},
    ]
    # Le compte et la caisse bougent dans la même transaction (R21).
    assert sorted(
        MouvementCompte.objects.values_list("sens", "montant", "source_type"),
    ) == [(-1, 10_200, "livraison"), (1, 5_000, "encaissement")]
    assert _especes(client_de, caissiere, caisse) == 5_000
    trace = LigneJournal.objects.get(action="livraison.enregistree")
    assert trace.apres is not None
    assert (trace.apres["recu"], trace.apres["mode"]) == (5_000, "especes")


def test_mobile_money_avec_reference(client_de, caissiere, caisse, rachel_boutique):
    corps = {
        "client": rachel_boutique.pk,
        "lignes": {"BAG": 100},
        "paiement": {"mode": "mtn", "montant": 9_500},
    }
    reponse = livrer(client_de(caissiere), corps, "sans-ref")
    assert reponse.status_code == 400
    assert reponse.json()["code"] == "reference_obligatoire"
    # Refus : rien n'est enregistré, ni livraison ni mouvement.
    assert not Livraison.objects.exists()
    assert not MouvementCompte.objects.exists()
    corps["paiement"]["reference"] = "MP241027.0815.A12345"
    reponse = livrer(client_de(caissiere), corps, "avec-ref")
    assert reponse.status_code == 201
    assert reponse.json()["solde_apres"] == 0
    assert reponse.json()["paiements"][0]["reference"] == "MP241027.0815.A12345"
    # Le mobile money n'entre pas dans les espèces de la caisse.
    assert _especes(client_de, caissiere, caisse) == 0


def test_rembourser_une_ancienne_dette(client_de, caissiere, caisse, mama):
    livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"BAG": 10}}, "a")
    reponse = client_de(caissiere).post(
        ENCAISSEMENTS,
        {"client": mama.pk, "mode": "orange", "montant": 600, "reference": "OM-77"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="dette",
    )
    assert reponse.status_code == 201, reponse.content
    encaissement = reponse.json()
    assert encaissement["livraison"] is None
    assert (encaissement["solde_avant"], encaissement["solde_apres"]) == (-1_000, -400)
    assert LigneJournal.objects.get(action="encaissement.enregistre").apres == {
        "client": mama.pk,
        "caisse": caisse.pk,
        "mode": "orange",
        "montant": 600,
        "reference": "OM-77",
        "solde_avant": -1_000,
        "solde_apres": -400,
    }
    # Payer au-delà du dû rembourse le reste de la dette : reste positif.
    reponse = livrer(
        client_de(caissiere),
        {
            "client": mama.pk,
            "lignes": {"BAG": 5},
            "paiement": {"mode": "especes", "montant": 900},
        },
        "b",
    )
    assert (reponse.json()["reste"], reponse.json()["solde_apres"]) == (400, 0)
    detail = reverse("api:client-detail", kwargs={"pk": mama.pk})
    assert client_de(caissiere).get(detail).json()["solde"] == 0


def test_encaissement_idempotent(client_de, caissiere, caisse, mama):
    corps = {"client": mama.pk, "mode": "especes", "montant": 1_000}
    sans_cle = client_de(caissiere).post(ENCAISSEMENTS, corps, format="json")
    assert sans_cle.json()["code"] == "cle_idempotence_absente"
    for _ in range(2):
        client_de(caissiere).post(
            ENCAISSEMENTS,
            corps,
            format="json",
            HTTP_IDEMPOTENCY_KEY="reprise-reseau",
        )
    assert Encaissement.objects.count() == 1
    assert _especes(client_de, caissiere, caisse) == 1_000


def test_liste_par_caisse(client_de, caissiere, proprietaire, caisse, mama):
    client_de(caissiere).post(
        ENCAISSEMENTS,
        {"client": mama.pk, "mode": "especes", "montant": 1_000},
        format="json",
        HTTP_IDEMPOTENCY_KEY="x",
    )
    reponse = client_de(proprietaire).get(ENCAISSEMENTS, {"caisse": caisse.pk})
    assert reponse.json()["count"] == 1
    reponse = client_de(proprietaire).post(
        ENCAISSEMENTS,
        {"client": mama.pk, "mode": "especes", "montant": 1_000},
        format="json",
        HTTP_IDEMPOTENCY_KEY="y",
    )
    assert reponse.status_code == 403


def test_la_base_refuse_le_mobile_money_sans_reference(caisse, caissiere, mama):
    with pytest.raises(IntegrityError), transaction.atomic():
        Encaissement.objects.create(
            semaine_id=caisse.semaine_id,
            caisse=caisse,
            client=mama,
            mode="mtn",
            montant=1_000,
            cree_par=caissiere,
        )
