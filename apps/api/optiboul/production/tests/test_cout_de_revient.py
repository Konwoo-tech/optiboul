from decimal import Decimal

import pytest
from django.urls import reverse

from optiboul.core.application.journal import Auteur
from optiboul.core.infrastructure.parametres import depot_parametres
from optiboul.core.infrastructure.parametres import parametre
from optiboul.production.domain.fiches import cout_de_revient
from optiboul.production.infrastructure.models import Produit
from optiboul.production.infrastructure.produits import fiche_en_cours


def test_cout_et_marge_en_entiers():
    cout = cout_de_revient(
        {"farine": Decimal(50), "sel": Decimal(1000), "levure": Decimal(10)},
        {"farine": Decimal("390.5"), "sel": Decimal("0.1")},
        pains_par_sac=480,
        prix_de_vente=100,
    )
    assert (cout.par_sac, cout.par_pain, cout.marge_par_pain) == (19625, 41, 59)
    assert cout.sans_prix == ["levure"]


def test_sans_prix_de_vente_pas_de_marge():
    cout = cout_de_revient({}, {}, pains_par_sac=480, prix_de_vente=None)
    assert (cout.par_pain, cout.marge_par_pain) == (0, None)


pytestmark = pytest.mark.django_db


def _fiche(client):
    produit = Produit.objects.exclude(fiches=None).earliest("id")
    assert fiche_en_cours(produit.pk) is not None
    url = reverse("api:produit-detail", kwargs={"pk": produit.pk})
    return client.get(url).json()["fiche"]


def test_le_cout_suit_le_prix_du_sac(client_de, gerant, proprietaire):
    client = client_de(gerant)
    avant = _fiche(client)["cout"]
    assert avant["par_sac"] > 0
    depot_parametres.enregistrer(
        "prix_sac_farine",
        parametre("prix_sac_farine") * 2,
        Auteur(proprietaire.pk, proprietaire.name),
    )
    assert _fiche(client)["cout"]["par_sac"] > avant["par_sac"]


def test_cout_cache_a_la_caisse(client_de, caissiere):
    assert _fiche(client_de(caissiere))["cout"] is None
