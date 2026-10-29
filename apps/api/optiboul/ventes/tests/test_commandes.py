from datetime import date
from datetime import datetime
from datetime import time
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.models import Client
from optiboul.conftest import MARDI
from optiboul.conftest import MARDI_8H
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.semaines import FUSEAU
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Limites
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.commandes import heure_limite
from optiboul.ventes.domain.commandes import quantites_saisies
from optiboul.ventes.domain.commandes import sacs_a_petrir
from optiboul.ventes.domain.commandes import session_visee
from optiboul.ventes.infrastructure.commandes import depot_commandes
from optiboul.ventes.infrastructure.models import Commande

LIMITES = Limites(time(5, 30), time(18, 30))
NUIT_DE_MARDI = Session(MARDI, NUIT)


def _a(heure: int, minute: int = 0, jour: date = MARDI) -> datetime:
    return datetime.combine(jour, time(heure, minute), tzinfo=FUSEAU)


@pytest.mark.parametrize(
    ("instant", "attendue"),
    [
        (_a(4), Session(MARDI, JOUR)),
        (_a(5, 30), Session(MARDI, NUIT)),
        (_a(18, 29), Session(MARDI, NUIT)),
        (_a(18, 30), Session(date(2026, 10, 28), JOUR)),
        (_a(23), Session(date(2026, 10, 28), JOUR)),
    ],
)
def test_session_visee(instant, attendue):
    assert session_visee(instant, LIMITES) == attendue


def test_heure_limite_et_veille():
    assert heure_limite(NUIT_DE_MARDI, LIMITES) == _a(18, 30)
    assert heure_limite(Session(MARDI, JOUR), LIMITES) == _a(5, 30)
    assert NUIT_DE_MARDI.veille() == Session(date(2026, 10, 26), NUIT)


def test_quantites_saisies():
    assert quantites_saisies({"BAG": 400, "KO": 0}) == {"BAG": 400}
    with pytest.raises(RefusMetier, match="aucun pain"):
        quantites_saisies({"BAG": 0})
    with pytest.raises(RefusMetier, match="négatives"):
        quantites_saisies({"BAG": -1})


def test_sacs_a_petrir_arrondis_au_sac_superieur():
    assert sacs_a_petrir(315, 315) == 1
    assert sacs_a_petrir(316, 315) == 2
    assert sacs_a_petrir(0, 315) == 0


@pytest.fixture
def clients(db) -> dict[str, Client]:
    return {
        nom: Client.objects.create(nom=nom, actif=nom != "Raoul")
        for nom in ("Rachel Boutique", "Mama Rasta", "Hôtel Ibrahim", "Raoul")
    }


def _saisir(client, corps):
    return client.post(reverse("api:commande-list"), corps, format="json")


@pytest.mark.django_db
class TestApi:
    def test_saisie_puis_modification(
        self,
        client_de,
        caissiere,
        s44,
        clients,
        horloge,
    ):
        rachel = clients["Rachel Boutique"]
        reponse = _saisir(
            client_de(caissiere),
            {"client": rachel.pk, "lignes": {"BAG": 400, "KO": 0}},
        )
        assert reponse.status_code == 201, reponse.content
        commande = reponse.json()
        assert commande["jour"] == "2026-10-27"
        assert commande["creneau"] == "nuit"
        assert commande["lignes"] == {"BAG": 400}
        assert commande["apres_heure_limite"] is False
        assert commande["saisie_par"] == "Rachel"
        reponse = _saisir(
            client_de(caissiere),
            {"client": rachel.pk, "lignes": {"BAG": 300, "KO": 100}},
        )
        assert reponse.status_code == 200
        assert reponse.json()["id"] == commande["id"]
        assert reponse.json()["lignes"] == {"BAG": 300, "KO": 100}
        traces = LigneJournal.objects.filter(objet_type="commande").order_by("id")
        assert [t.action for t in traces] == ["commande.saisie", "commande.modifiee"]
        assert traces[1].avant == {"jour": "2026-10-27", "creneau": "nuit", "BAG": 400}
        assert s44.commandes.count() == 1

    def test_sacs_a_petrir_recalcules(
        self,
        client_de,
        caissiere,
        gerant,
        s44,
        clients,
        horloge,
    ):
        for nom, lignes in [
            ("Rachel Boutique", {"BAG": 400}),
            ("Mama Rasta", {"BAG": 300, "KO": 50}),
        ]:
            _saisir(client_de(caissiere), {"client": clients[nom].pk, "lignes": lignes})
        reponse = client_de(gerant).get(reverse("api:commande-sacs"))
        assert reponse.status_code == 200
        sacs = reponse.json()
        assert sacs["jour"] == "2026-10-27"
        assert sacs["creneau"] == "nuit"
        assert sacs["heure_limite"] == "2026-10-27T18:30:00+01:00"
        assert sacs["apres_heure_limite"] is False
        assert sacs["clients"] == 2
        par_code = {p["code"]: p for p in sacs["produits"]}
        assert par_code["BAG"] == {
            "code": "BAG",
            "pains": 700,
            "pains_par_sac": 315,
            "sacs": 3,
        }
        assert par_code["KO"]["sacs"] == 1
        assert par_code["GC135"]["sacs"] == 0
        assert sacs["total_sacs"] == 4

    def test_heure_limite_parametrable(
        self,
        client_de,
        caissiere,
        proprietaire,
        s44,
        clients,
        horloge,
    ):
        client_de(proprietaire).put(
            reverse(
                "api:parametre-detail",
                kwargs={"cle": "heure_limite_commandes_nuit"},
            ),
            {"valeur": "07:00"},
            format="json",
        )
        # Après 07:00, la nuit de mardi est close : la commande vise mercredi, jour.
        reponse = _saisir(
            client_de(caissiere),
            {"client": clients["Raoul"].pk, "lignes": {"BAG": 1}},
        )
        assert reponse.json()["code"] == "client_inconnu"
        reponse = _saisir(
            client_de(caissiere),
            {"client": clients["Mama Rasta"].pk, "lignes": {"BAG": 10}},
        )
        assert (reponse.json()["jour"], reponse.json()["creneau"]) == (
            "2026-10-28",
            "jour",
        )
        # Saisie explicite pour la nuit de mardi : notée après l'heure limite.
        reponse = _saisir(
            client_de(caissiere),
            {
                "client": clients["Rachel Boutique"].pk,
                "jour": "2026-10-27",
                "creneau": "nuit",
                "lignes": {"BAG": 10},
            },
        )
        assert reponse.json()["apres_heure_limite"] is True

    def test_reprendre_celles_de_la_veille(
        self,
        client_de,
        caissiere,
        s44,
        clients,
        horloge,
    ):
        lundi_nuit = Session(date(2026, 10, 26), NUIT)
        for nom, lignes in [
            ("Rachel Boutique", {"BAG": 400}),
            ("Mama Rasta", {"KO": 80}),
            ("Raoul", {"BAG": 30}),
        ]:
            depot_commandes.enregistrer(
                semaine=s44.pk,
                client=clients[nom].pk,
                session=lundi_nuit,
                lignes=lignes,
                apres_heure_limite=False,
                auteur=caissiere.pk,
                le=MARDI_8H,
            )
        # Mama Rasta a déjà commandé pour ce soir : sa commande ne change pas.
        _saisir(
            client_de(caissiere),
            {"client": clients["Mama Rasta"].pk, "lignes": {"KO": 20}},
        )
        reponse = client_de(caissiere).post(
            reverse("api:commande-reprendre-veille"),
            {},
            format="json",
        )
        assert reponse.status_code == 200, reponse.content
        assert reponse.json()["reprises"] == 1
        assert reponse.json()["commandes"][0]["client"]["nom"] == "Rachel Boutique"
        ce_soir = {
            c["client"]["nom"]: c["lignes"]
            for c in client_de(caissiere).get(reverse("api:commande-list")).json()
        }
        assert ce_soir == {"Mama Rasta": {"KO": 20}, "Rachel Boutique": {"BAG": 400}}
        trace = LigneJournal.objects.get(action="commandes.reprises")
        assert trace.apres == {"reprises": 1, "de": "2026-10-26"}

    def test_droits(
        self,
        client_de,
        responsable_production,
        proprietaire,
        s44,
        clients,
        horloge,
    ):
        corps = {"client": clients["Mama Rasta"].pk, "lignes": {"BAG": 10}}
        for refuse in (responsable_production, proprietaire):
            assert _saisir(client_de(refuse), corps).status_code == 403
        assert (
            client_de(responsable_production)
            .get(reverse("api:commande-list"))
            .status_code
            == 200
        )

    def test_semaine_ouverte_obligatoire(self, client_de, caissiere, clients, horloge):
        reponse = _saisir(
            client_de(caissiere),
            {"client": clients["Mama Rasta"].pk, "lignes": {"BAG": 10}},
        )
        assert reponse.status_code == 409
        assert reponse.json()["code"] == "semaine_non_ouverte"

    def test_produit_inconnu_ou_commande_vide(
        self,
        client_de,
        caissiere,
        s44,
        clients,
        horloge,
    ):
        client = clients["Mama Rasta"].pk
        reponse = _saisir(
            client_de(caissiere),
            {"client": client, "lignes": {"XXL": 1}},
        )
        assert reponse.status_code == 400
        assert reponse.json()["produits"] == ["XXL"]
        reponse = _saisir(client_de(caissiere), {"client": client, "lignes": {}})
        assert reponse.json()["code"] == "commande_vide"

    def test_annuler(self, client_de, caissiere, s44, clients, horloge):
        reponse = _saisir(
            client_de(caissiere),
            {"client": clients["Mama Rasta"].pk, "lignes": {"BAG": 10}},
        )
        url = reverse("api:commande-annuler", kwargs={"pk": reponse.json()["id"]})
        assert client_de(caissiere).post(url).status_code == 204
        assert not Commande.objects.exists()
        assert LigneJournal.objects.get(action="commande.annulee").avant == {
            "jour": "2026-10-27",
            "creneau": "nuit",
            "BAG": 10,
        }

    def test_plus_de_commande_apres_la_fermeture_de_la_caisse(
        self,
        client_de,
        caissiere,
        s44,
        clients,
    ):
        Caisse.objects.create(
            semaine=s44,
            jour=MARDI,
            creneau="nuit",
            caissiere=caissiere,
            fonds=20_000,
            statut="fermee",
            en_cours=False,
        )
        with mock.patch("django.utils.timezone.now", return_value=_a(8)):
            reponse = _saisir(
                client_de(caissiere),
                {"client": clients["Mama Rasta"].pk, "lignes": {"BAG": 10}},
            )
        assert reponse.json()["code"] == "session_fermee"
