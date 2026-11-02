import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.paie.infrastructure.models import ElementPaie
from optiboul.paie.infrastructure.models import EtatPaie

pytestmark = pytest.mark.django_db


def _ajouter(client, ligne, **corps):
    donnees = {"genre": "gain", "description": "Prime", "montant": 5_000} | corps
    url = reverse("api:paie-ligne-elements", kwargs={"ligne": ligne.pk})
    return client.post(url, donnees, format="json")


def _detail(client, paie):
    return client.get(reverse("api:paie-detail", kwargs={"pk": paie["id"]})).json()


def test_plusieurs_gains_et_penalites_dans_le_net(
    client_de,
    gerant,
    paie,
    ligne_mireille,
):
    client = client_de(gerant)
    _ajouter(client, ligne_mireille)
    _ajouter(client, ligne_mireille, description="Nuits", montant=2_000)
    reponse = _ajouter(
        client,
        ligne_mireille,
        genre="penalite",
        description="Retard",
        montant=1_500,
    )
    assert reponse.status_code == 201
    assert reponse.json()["auteur"] == gerant.name
    ligne = _detail(client, paie)["lignes"][0]
    assert (ligne["gains"], ligne["penalites"]) == (7_000, 1_500)
    assert ligne["net"] == 83_500
    assert len(ligne["elements"]) == 3
    assert LigneJournal.objects.filter(action="paie.penalite_ajoute").exists()


def test_modifier_puis_retirer(client_de, gerant, paie, ligne_mireille):
    client = client_de(gerant)
    element = _ajouter(client, ligne_mireille).json()["id"]
    url = reverse("api:paie-element", kwargs={"element": element})
    reponse = client.put(url, {"description": "Prime", "montant": 9_000}, format="json")
    assert reponse.json()["montant"] == 9_000
    assert client.delete(url).status_code == 204
    assert not ElementPaie.objects.exists()


def test_modifiables_en_brouillon_seulement(client_de, gerant, paie, ligne_mireille):
    client = client_de(gerant)
    element = _ajouter(client, ligne_mireille).json()["id"]
    EtatPaie.objects.update(statut="soumis")
    assert _ajouter(client, ligne_mireille).json()["code"] == "paie_non_brouillon"
    url = reverse("api:paie-element", kwargs={"element": element})
    assert client.delete(url).json()["code"] == "paie_non_brouillon"
    assert ElementPaie.objects.count() == 1


@pytest.mark.parametrize(
    ("corps", "code"),
    [
        ({"description": " "}, "description_obligatoire"),
        ({"montant": 0}, "montant_invalide"),
    ],
)
def test_motive_et_positif(client_de, gerant, ligne_mireille, corps, code):
    assert _ajouter(client_de(gerant), ligne_mireille, **corps).json()["code"] == code


def test_proprietaire_refuse(client_de, proprietaire, ligne_mireille):
    assert _ajouter(client_de(proprietaire), ligne_mireille).status_code == 403
