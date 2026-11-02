from unittest import mock

import pytest
from django.db import DatabaseError
from django.db import transaction
from django.urls import reverse

from optiboul.caisse.application import caisses as cas
from optiboul.caisse.domain.caisses import GenreMouvement
from optiboul.caisse.infrastructure.caisses import depots
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.caisse.infrastructure.models import MouvementCaisse
from optiboul.core.api.contexte import Auteur
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users.tests.factories import utilisateur_avec_profil

pytestmark = pytest.mark.django_db


@pytest.fixture
def caisse(client_de, caissiere, planning_rachel, horloge) -> Caisse:
    reponse = client_de(caissiere).post(reverse("api:caisse-ouvrir"), {"fonds": 20_000})
    return Caisse.objects.get(pk=reponse.json()["id"])


def _auteur(utilisateur) -> Auteur:
    return Auteur(
        utilisateur_id=utilisateur.pk,
        nom=utilisateur.name,
        profil=utilisateur.profil,
    )


def _mouvements(caisse: Caisse, caissiere, gerant) -> None:
    for genre, montant in [
        (GenreMouvement.ESPECES, 150_000),
        (GenreMouvement.ESPECES, 12_500),
        (GenreMouvement.DEPENSE, 5_000),
        (GenreMouvement.REMISE, 100_000),
    ]:
        cas.enregistrer_mouvement(
            depots,
            caisse_id=caisse.pk,
            genre=genre,
            montant=montant,
            auteur=_auteur(caissiere),
            receveur=gerant.pk if genre is GenreMouvement.REMISE else None,
        )


def _fermer(client, caisse: Caisse, compte: int):
    url = reverse("api:caisse-fermer", kwargs={"pk": caisse.pk})
    with mock.patch(
        "optiboul.caisse.api.caisses.demander_sauvegarde",
    ) as sauvegarde:
        reponse = client.post(url, {"compte": compte}, format="json")
    return reponse, sauvegarde


def test_detail_des_especes(client_de, caisse, caissiere, gerant):
    _mouvements(caisse, caissiere, gerant)
    url = reverse("api:caisse-especes", kwargs={"pk": caisse.pk})
    assert client_de(caissiere).get(url).json() == {
        "fonds": 20_000,
        "especes": 162_500,
        "depenses": 5_000,
        "remises": 100_000,
        "attendu": 77_500,
        "plafond": 100_000,
        "remise_proposee": 0,
    }


@pytest.mark.parametrize(
    ("compte", "resultat", "ecart"),
    [(77_500, "JUSTE", 0), (76_000, "MANQUE", -1_500), (78_000, "EXCEDENT", 500)],
)
def test_un_seul_comptage(
    client_de,
    caisse,
    caissiere,
    gerant,
    compte,
    resultat,
    ecart,
):
    _mouvements(caisse, caissiere, gerant)
    reponse, sauvegarde = _fermer(client_de(caissiere), caisse, compte)
    assert reponse.status_code == 200, reponse.content
    corps = reponse.json()
    assert corps["resultat"] == resultat
    assert corps["caisse"]["attendu"] == 77_500
    assert corps["caisse"]["compte"] == compte
    assert corps["caisse"]["ecart"] == ecart
    assert corps["caisse"]["statut"] == "fermee"
    assert corps["caisse"]["en_cours"] is False
    sauvegarde.assert_called_once_with(Declencheur.CLOTURE_CAISSE)
    trace = LigneJournal.objects.get(action="caisse.fermee")
    assert trace.apres == {
        "statut": "fermee",
        "attendu": 77_500,
        "compte": compte,
        "ecart": ecart,
        "resultat": resultat,
    }


def test_la_fermeture_verrouille_les_saisies(client_de, caisse, caissiere):
    _fermer(client_de(caissiere), caisse, 20_000)
    with pytest.raises(RefusMetier, match="fermée"):
        cas.enregistrer_mouvement(
            depots,
            caisse_id=caisse.pk,
            genre=GenreMouvement.ESPECES,
            montant=1_000,
            auteur=_auteur(caissiere),
        )
    reponse, _ = _fermer(client_de(caissiere), caisse, 20_000)
    assert reponse.json()["code"] == "caisse_fermee"


def test_qui_ferme(client_de, caisse, gerant, proprietaire):
    davy = utilisateur_avec_profil("caissier", name="Davy")
    reponse, _ = _fermer(client_de(davy), caisse, 20_000)
    # Davy ne voit pas la caisse de Rachel.
    assert reponse.status_code == 404
    reponse, _ = _fermer(client_de(proprietaire), caisse, 20_000)
    assert reponse.json()["code"] == "droit_insuffisant"
    reponse, _ = _fermer(client_de(gerant), caisse, 20_000)
    assert reponse.json()["resultat"] == "JUSTE"


def test_le_registre_est_en_ajout_seul(caisse, caissiere, gerant):
    _mouvements(caisse, caissiere, gerant)
    with pytest.raises(DatabaseError, match="ajout seul"), transaction.atomic():
        MouvementCaisse.objects.update(montant=1)
    with pytest.raises(DatabaseError, match="ajout seul"), transaction.atomic():
        MouvementCaisse.objects.all().delete()
    assert MouvementCaisse.objects.count() == 4


def test_montant_positif_obligatoire(caisse, caissiere):
    with pytest.raises(RefusMetier, match="positif"):
        cas.enregistrer_mouvement(
            depots,
            caisse_id=caisse.pk,
            genre=GenreMouvement.DEPENSE,
            montant=0,
            auteur=_auteur(caissiere),
        )
