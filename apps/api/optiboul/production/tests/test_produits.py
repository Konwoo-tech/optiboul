from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.production.domain.fiches import Fiche
from optiboul.production.domain.fiches import boules
from optiboul.production.domain.fiches import boules_par_sac
from optiboul.production.domain.fiches import verifier_fiche
from optiboul.production.infrastructure.models import FicheTechnique
from optiboul.production.infrastructure.models import Produit

MATIERES = {"farine", "eau", "sel", "levure", "ameliorant", "glace"}
RECETTE = {"farine": "50.000", "eau": "27.400", "sel": "600.000", "levure": "450.000"}


def _fiche(**champs) -> Fiche:
    valeurs: dict[str, Any] = {
        "poids_boule": 5000,
        "pains_par_boule": 20,
        "pains_par_sac": 315,
        "procede": "",
        "recette": {"farine": Decimal(50)},
    } | champs
    return Fiche(**valeurs)


def test_rendement_positif():
    with pytest.raises(RefusMetier) as refus:
        verifier_fiche(_fiche(pains_par_sac=0, poids_boule=0), MATIERES)
    assert refus.value.autres["champs"] == ["poids_boule", "pains_par_sac"]


def test_recette_de_matieres_connues_avec_farine():
    with pytest.raises(RefusMetier, match="inconnues : cacao"):
        verifier_fiche(_fiche(recette={"farine": Decimal(50), "cacao": 1}), MATIERES)
    with pytest.raises(RefusMetier, match="farine"):
        verifier_fiche(_fiche(recette={"sel": Decimal(600)}), MATIERES)
    with pytest.raises(RefusMetier, match="négatives"):
        verifier_fiche(
            _fiche(recette={"farine": Decimal(50), "sel": Decimal(-1)}),
            MATIERES,
        )
    with pytest.raises(RefusMetier, match="au moins une boule"):
        verifier_fiche(_fiche(pains_par_boule=400, pains_par_sac=315), MATIERES)


def test_boules():
    assert boules(315, 20) == 16
    assert boules(0, 20) == 0
    assert boules_par_sac(_fiche()) == Decimal("15.75")


def test_meme_contenu_ignore_les_zeros_et_les_espaces():
    fiche = _fiche(procede="Pétrir 12 min ")
    autre = _fiche(procede="Pétrir 12 min", recette={"farine": 50, "sel": 0})
    assert fiche.meme_contenu(autre)
    assert not fiche.meme_contenu(_fiche(pains_par_sac=316))


@pytest.mark.django_db
class TestApi:
    def test_les_sept_produits_de_depart(self, client_de, caissiere):
        reponse = client_de(caissiere).get(reverse("api:produit-list"))
        assert reponse.status_code == 200
        produits = reponse.json()["results"]
        assert [p["code"] for p in produits] == [
            "BAG",
            "KO",
            "GC135",
            "GC170",
            "PL",
            "C2",
            "PSL",
        ]
        baguette = produits[0]
        assert baguette["prix"] == 100
        assert baguette["fiche"]["version"] == 1
        assert baguette["fiche"]["pains_par_sac"] == 315
        assert baguette["fiche"]["boules_par_sac"] == "15.75"
        assert baguette["fiche"]["recette"]["farine"] == "50.000"

    def test_les_matieres(self, client_de, responsable_production):
        reponse = client_de(responsable_production).get(reverse("api:matiere-list"))
        codes = [m["code"] for m in reponse.json()]
        assert codes[:3] == ["farine", "eau", "sel"]
        farine = reponse.json()[0]
        assert farine == {
            "code": "farine",
            "nom": "Farine",
            "unite": "kg",
            "cle": True,
            "stockee": True,
            "prix_unitaire": "390.50",
        }

    def test_qui_gere_les_produits(
        self,
        client_de,
        gerant,
        responsable_production,
        proprietaire,
        administrateur,
    ):
        nouveau = {"code": "PCH", "nom": "Pain au chocolat", "prix": 150}
        url = reverse("api:produit-list")
        for refuse in (gerant, responsable_production):
            assert (
                client_de(refuse).post(url, nouveau, format="json").status_code == 403
            )
        assert client_de(None).get(url).status_code == 403
        reponse = client_de(proprietaire).post(url, nouveau, format="json")
        assert reponse.status_code == 201, reponse.content
        assert reponse.json()["fiche"] is None
        detail = reverse("api:produit-detail", kwargs={"pk": reponse.json()["id"]})
        reponse = client_de(administrateur).patch(
            detail,
            {"actif": False},
            format="json",
        )
        assert reponse.json()["actif"] is False
        traces = LigneJournal.objects.filter(objet_type="produit").order_by("id")
        assert [t.action for t in traces] == ["produit.cree", "produit.modifie"]
        assert traces[1].avant == traces[0].apres
        assert (traces[1].apres or {})["actif"] is False
        assert client_de(proprietaire).delete(detail).status_code == 405

    def test_nouvelle_version_de_fiche(self, client_de, proprietaire, gerant):
        baguette = Produit.objects.get(code="BAG")
        url = reverse("api:produit-nouvelle-version", kwargs={"pk": baguette.pk})
        corps = {
            "poids_boule": 5000,
            "pains_par_boule": 20,
            "pains_par_sac": 320,
            "procede": "Pétrissage 12 min, pointage 30 min.",
            "recette": RECETTE,
        }
        assert client_de(gerant).post(url, corps, format="json").status_code == 403
        reponse = client_de(proprietaire).post(url, corps, format="json")
        assert reponse.status_code == 201, reponse.content
        assert reponse.json()["version"] == 2
        assert reponse.json()["cree_par_nom"] == "Fotso"
        assert reponse.json()["recette"] == RECETTE
        # La version 1 reste consultable, la plus récente d'abord.
        historique = client_de(gerant).get(
            reverse("api:produit-fiches", kwargs={"pk": baguette.pk}),
        )
        assert [f["version"] for f in historique.json()] == [2, 1]
        assert (
            FicheTechnique.objects.get(produit=baguette, version=1).pains_par_sac == 315
        )
        trace = LigneJournal.objects.get(action="fiche.nouvelle_version")
        assert (trace.avant or {})["pains_par_sac"] == 315
        assert trace.apres == {
            "poids_boule": 5000,
            "pains_par_boule": 20,
            "pains_par_sac": 320,
            "procede": "Pétrissage 12 min, pointage 30 min.",
            "recette": {
                "farine": "50.000",
                "eau": "27.400",
                "sel": "600.000",
                "levure": "450.000",
            },
            "version": 2,
        }
        # Une fiche identique ne crée pas de version.
        reponse = client_de(proprietaire).post(url, corps, format="json")
        assert reponse.status_code == 409
        assert reponse.json()["code"] == "fiche_inchangee"

    def test_fiche_invalide(self, client_de, administrateur):
        baguette = Produit.objects.get(code="BAG")
        url = reverse("api:produit-nouvelle-version", kwargs={"pk": baguette.pk})
        corps = {
            "poids_boule": 5000,
            "pains_par_boule": 20,
            "pains_par_sac": 315,
            "recette": {"farine": "50", "cacao": "2"},
        }
        reponse = client_de(administrateur).post(url, corps, format="json")
        assert reponse.status_code == 400
        assert reponse.json()["code"] == "fiche_invalide"
        assert reponse.json()["champs"] == ["recette"]
