import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.parametres import parametre

pytestmark = pytest.mark.django_db

LISTE = reverse("api:parametre-list")


def _url(cle: str) -> str:
    return reverse("api:parametre-detail", kwargs={"cle": cle})


def test_tous_les_parametres_avec_leur_valeur_par_defaut(client_de, administrateur):
    reponse = client_de(administrateur).get(LISTE)
    assert reponse.status_code == 200
    fonds = next(p for p in reponse.json() if p["cle"] == "fonds_caisse")
    assert fonds["valeur"] == 20_000
    assert fonds["unite"] == "FCFA"
    assert fonds["modifie_par"] == ""
    assert len(reponse.json()) == 28


def test_le_proprietaire_modifie_avec_historique_et_trace(client_de, proprietaire):
    client = client_de(proprietaire)
    assert (
        client.put(
            _url("plafond_dette_client"),
            {"valeur": 3_000},
            format="json",
        ).json()["valeur"]
        == 3_000
    )
    client.put(_url("plafond_dette_client"), {"valeur": 2_500}, format="json")

    assert parametre("plafond_dette_client") == 2_500
    historique = client.get(_url("plafond_dette_client") + "historique/").json()
    assert [v["valeur"] for v in historique] == [2_500, 3_000]
    assert historique[0]["auteur"] == "Fotso"

    traces = LigneJournal.objects.filter(action="parametre.modifie").order_by("id")
    assert [(t.avant, t.apres) for t in traces] == [
        ({"valeur": 2_000}, {"valeur": 3_000}),
        ({"valeur": 3_000}, {"valeur": 2_500}),
    ]


def test_valeur_invalide_refusee(client_de, proprietaire):
    reponse = client_de(proprietaire).put(
        _url("inactivite_comptoir"),
        {"valeur": 7},
        format="json",
    )
    assert reponse.status_code == 400
    assert "1, 5, 10, 15" in reponse.json()["valeur"]
    assert parametre("inactivite_comptoir") == 5


def test_parametre_inconnu(client_de, proprietaire):
    assert (
        client_de(proprietaire)
        .put(_url("tva"), {"valeur": 1}, format="json")
        .status_code
        == 404
    )


@pytest.mark.parametrize("profil", ["gerant", "caissiere", "administrateur"])
def test_seul_le_proprietaire_modifie(client_de, request, profil):
    client = client_de(request.getfixturevalue(profil))
    assert (
        client.put(_url("fonds_caisse"), {"valeur": 1}, format="json").status_code
        == 403
    )


@pytest.mark.parametrize("profil", ["gerant", "caissiere"])
def test_ni_le_gerant_ni_la_caisse_ne_consultent(client_de, request, profil):
    assert client_de(request.getfixturevalue(profil)).get(LISTE).status_code == 403
