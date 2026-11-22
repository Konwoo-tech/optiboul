"""Journal lisible (#361) : total, familles, acteurs, libellés, objets nommés."""

from datetime import date

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.application.journal import Auteur
from optiboul.core.domain.libelles_journal import ACTIONS
from optiboul.core.domain.libelles_journal import Famille
from optiboul.core.domain.libelles_journal import famille_de
from optiboul.core.domain.libelles_journal import libelle
from optiboul.core.infrastructure.journal import journaliser

pytestmark = pytest.mark.django_db

URL = reverse("api:journal-list")
ACTEURS = reverse("api:journal-acteurs")


def _auteur(utilisateur) -> Auteur:
    return Auteur(utilisateur_id=utilisateur.pk, nom=utilisateur.name)


def test_libelles_connus_et_repli():
    assert libelle("caisse.ouverte") == "Caisse ouverte"
    assert libelle("caisse.ouverte", "en") == "Till opened"
    assert libelle("caisse.nouveaute_future") == "Caisse : nouveaute future"
    assert libelle("inconnu.chose") == "Autre : chose"
    assert famille_de("mfa.totp_active") is Famille.CONNEXION
    assert famille_de("reception.recue") is Famille.FOURNISSEUR
    assert famille_de("rapports.rapprochement") is Famille.AUTRE
    # Chaque libellé connu a son anglais et sa famille.
    for code, (francais, anglais) in ACTIONS.items():
        assert francais
        assert anglais
        assert famille_de(code) is not None


@pytest.fixture
def journal(s44, caissiere, gerant):
    caisse = Caisse.objects.create(
        semaine=s44,
        jour=date(2026, 11, 19),
        creneau="jour",
        caissiere=caissiere,
        fonds=20_000,
    )
    journaliser(
        "caisse.ouverte",
        auteur=_auteur(caissiere),
        objet_type="caisse",
        objet_id=caisse.pk,
    )
    journaliser(
        "semaine.ouverte",
        auteur=_auteur(gerant),
        objet_type="semaine",
        objet_id=s44.pk,
    )
    journaliser("connexion.echec", auteur=_auteur(caissiere))
    journaliser("rapports.rapprochement", auteur=_auteur(gerant))
    journaliser(
        "livraison.enregistree",
        auteur=_auteur(caissiere),
        objet_type="livraison",
        objet_id=12,
    )
    return caisse


def test_total_et_taille_de_page(client_de, proprietaire, journal):
    reponse = client_de(proprietaire).get(URL, {"page_size": 2}).json()
    assert reponse["total"] == 5
    assert len(reponse["results"]) == 2
    assert reponse["next"] is not None
    filtre = client_de(proprietaire).get(URL, {"famille": "caisse"}).json()
    assert filtre["total"] == 2


@pytest.mark.parametrize(
    ("famille", "actions"),
    [
        ("caisse", {"caisse.ouverte", "livraison.enregistree"}),
        ("semaine", {"semaine.ouverte"}),
        ("connexion", {"connexion.echec"}),
        ("autre", {"rapports.rapprochement"}),
        ("paie", set()),
    ],
)
def test_filtre_par_famille(client_de, proprietaire, journal, famille, actions):
    lignes = client_de(proprietaire).get(URL, {"famille": famille}).json()["results"]
    assert {ligne["action"] for ligne in lignes} == actions


def test_famille_inconnue(client_de, proprietaire):
    assert client_de(proprietaire).get(URL, {"famille": "x"}).status_code == 400


def test_libelles_et_objets_nommes_sans_requete_par_ligne(
    client_de,
    proprietaire,
    journal,
    s44,
):
    client = client_de(proprietaire)
    with CaptureQueriesContext(connection) as requetes:
        lignes = client.get(URL).json()["results"]
    par_action = {ligne["action"]: ligne for ligne in lignes}
    caisse = par_action["caisse.ouverte"]
    assert caisse["libelle"] == "Caisse ouverte"
    assert caisse["libelle_en"] == "Till opened"
    assert caisse["famille"] == "caisse"
    assert caisse["objet_libelle"] == "Caisse de jour du 19/11"
    assert par_action["semaine.ouverte"]["objet_libelle"] == "Semaine 44 de 2026"
    assert par_action["livraison.enregistree"]["objet_libelle"] == "Livraison n° 12"
    assert par_action["connexion.echec"]["objet_libelle"] == ""
    # Session, comptage, page et une requête par type d'objet présent.
    assert len(requetes) <= 10


def test_acteurs(client_de, proprietaire, administrateur, caissiere, gerant, journal):
    acteurs = client_de(administrateur).get(ACTEURS).json()
    assert {(a["id"], a["profil"]) for a in acteurs} == {
        (caissiere.pk, "caissier"),
        (gerant.pk, "gerant"),
    }
    assert client_de(caissiere).get(ACTEURS).status_code == 403
