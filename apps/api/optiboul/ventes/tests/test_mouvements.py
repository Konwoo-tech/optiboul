import pytest
from django.urls import reverse

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users.tests.factories import utilisateur_avec_profil
from optiboul.ventes.domain.mouvements import GenreMouvementInterne as Genre
from optiboul.ventes.domain.mouvements import MouvementInterne
from optiboul.ventes.domain.mouvements import totaux
from optiboul.ventes.domain.mouvements import verifier_mouvement

from .test_livraisons import livrer

LISTE = reverse("api:mouvement-interne-list")


def test_motif_obligatoire():
    with pytest.raises(RefusMetier, match="motif"):
        verifier_mouvement(MouvementInterne(Genre.RATION, "BAG", 2, "  "))
    with pytest.raises(RefusMetier, match="positive"):
        verifier_mouvement(MouvementInterne(Genre.RATION, "BAG", 0, "Repas"))
    assert (
        verifier_mouvement(MouvementInterne(Genre.RATION, "BAG", 2, " Repas ")).motif
        == "Repas"
    )


def test_totaux_par_genre_et_produit():
    resultat = totaux(
        [
            (Genre.VENTE_GUICHET, "BAG", 20),
            (Genre.VENTE_GUICHET, "BAG", 15),
            (Genre.RETOURS, "KO", 3),
        ],
    )
    assert resultat[Genre.VENTE_GUICHET] == {"BAG": 35}
    assert resultat[Genre.RETOURS] == {"KO": 3}
    assert resultat[Genre.RATION] == {}


def _saisir(client, genre, produit, quantite, motif="Fin de session"):
    return client.post(
        LISTE,
        {"genre": genre, "produit": produit, "quantite": quantite, "motif": motif},
        format="json",
    )


@pytest.mark.django_db
def test_les_quatre_mouvements(client_de, caissiere, caisse, mama):
    for genre, produit, quantite in [
        ("vente_guichet", "BAG", 40),
        ("retours", "BAG", 5),
        ("reste_en_salle", "KO", 12),
        ("ration", "BAG", 4),
    ]:
        reponse = _saisir(client_de(caissiere), genre, produit, quantite)
        assert reponse.status_code == 201, reponse.content
    assert reponse.json()["cree_par"] == "Rachel"
    assert reponse.json()["caisse"] == caisse.pk
    livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"BAG": 10}})
    reponse = client_de(caissiere).get(
        reverse("api:mouvement-interne-totaux"),
        {"caisse": caisse.pk},
    )
    assert reponse.json() == {
        "caisse": caisse.pk,
        "livres": {"BAG": 10},
        "vente_guichet": {"BAG": 40},
        "retours": {"BAG": 5},
        "reste_en_salle": {"KO": 12},
        "ration": {"BAG": 4},
    }
    assert (
        LigneJournal.objects.filter(action="mouvement_interne.enregistre").count() == 4
    )


@pytest.mark.django_db
def test_refus(client_de, caissiere, proprietaire, caisse):
    assert (
        _saisir(client_de(caissiere), "ration", "BAG", 2, motif=" ").status_code == 400
    )
    reponse = _saisir(client_de(caissiere), "ration", "XXL", 2)
    assert reponse.json()["code"] == "produit_inconnu"
    assert _saisir(client_de(proprietaire), "ration", "BAG", 2).status_code == 403


@pytest.mark.django_db
def test_une_caissiere_ne_voit_que_ses_caisses(client_de, caissiere, gerant, caisse):
    _saisir(client_de(caissiere), "vente_guichet", "BAG", 10)
    davy = utilisateur_avec_profil("caissier", name="Davy")
    assert client_de(davy).get(LISTE).json()["count"] == 0
    assert client_de(gerant).get(LISTE, {"caisse": caisse.pk}).json()["count"] == 1
    totaux_davy = client_de(davy).get(
        reverse("api:mouvement-interne-totaux"),
        {"caisse": caisse.pk},
    )
    assert totaux_davy.status_code == 404
