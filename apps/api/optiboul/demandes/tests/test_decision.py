import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.models import Notification
from optiboul.users.connexion import definir_code

from .test_demandes import emettre

pytestmark = pytest.mark.django_db


def _url(action: str, demande: dict) -> str:
    return reverse(f"api:demande-{action}", kwargs={"pk": demande["id"]})


@pytest.fixture
def demande(client_de, caissiere, type_essai, mama) -> dict:
    return emettre(client_de(caissiere), mama.pk).json()


def test_accord_en_un_clic(client_de, gerant, caissiere, demande, decisions, mama):
    reponse = client_de(gerant).post(_url("accorder", demande), {}, format="json")
    assert reponse.status_code == 200, reponse.content
    decidee = reponse.json()
    assert decidee["statut"] == "accordee"
    assert decidee["decide_par_nom"] == "Willy"
    assert decidee["via"] == "poste"
    assert decidee["decide_le"] is not None
    # L'objet lié change de statut avec la décision.
    assert decisions == [("accord", mama.pk, "Willy")]
    trace = LigneJournal.objects.get(action="demande.accordee")
    assert trace.acteur_nom == "Willy"
    assert trace.apres is not None
    assert (trace.apres["objet_type"], trace.apres["objet_id"]) == ("client", mama.pk)
    # L'émetteur est prévenu de la réponse.
    reponse_emetteur = Notification.objects.get(
        destinataire=caissiere,
        genre="demande.accordee",
    )
    assert reponse_emetteur.titre == "DEM-001 accordée"
    deja = client_de(gerant).post(
        _url("refuser", demande),
        {"motif": "x"},
        format="json",
    )
    assert deja.status_code == 409
    assert deja.json()["code"] == "demande_deja_decidee"


def test_refus_motive(client_de, proprietaire, caissiere, demande, decisions, mama):
    url = _url("refuser", demande)
    assert client_de(proprietaire).post(url, {}, format="json").status_code == 400
    assert (
        client_de(proprietaire).post(url, {"motif": " "}, format="json").status_code
        == 400
    )
    reponse = client_de(proprietaire).post(
        url,
        {"motif": "Dette déjà trop ancienne"},
        format="json",
        HTTP_X_OPTIBOUL_ENTREE="distante",
    )
    assert reponse.status_code == 200
    assert reponse.json()["statut"] == "refusee"
    assert reponse.json()["motif_refus"] == "Dette déjà trop ancienne"
    assert reponse.json()["via"] == "distance"
    assert decisions == [("refus", mama.pk, "Fotso")]
    titre = Notification.objects.get(
        destinataire=caissiere,
        genre="demande.refusee",
    ).titre
    assert titre == "DEM-001 refusée : Dette déjà trop ancienne"


def test_code_du_gerant_sur_le_poste(client_de, caissiere, gerant, demande, decisions):
    definir_code(gerant, "1234")
    url = _url("accorder", demande)
    sans_code = client_de(caissiere).post(url, {}, format="json")
    assert sans_code.status_code == 403
    assert sans_code.json()["code"] == "droit_insuffisant"
    faux = client_de(caissiere).post(
        url,
        {"code_gerant": {"utilisateur": gerant.pk, "code": "0000"}},
        format="json",
    )
    assert faux.status_code == 400
    assert faux.json()["code"] == "code_incorrect"
    gerant.refresh_from_db()
    assert gerant.echecs_connexion == 1
    reponse = client_de(caissiere).post(
        url,
        {"code_gerant": {"utilisateur": gerant.pk, "code": "1234"}},
        format="json",
    )
    assert reponse.status_code == 200, reponse.content
    # Signée du gérant, sans changer d'utilisateur sur le poste.
    assert (reponse.json()["decide_par_nom"], reponse.json()["via"]) == (
        "Willy",
        "code",
    )
    assert decisions == [("accord", demande["objet_id"], "Willy")]


def test_pas_de_validation_de_sa_propre_demande(
    client_de,
    gerant,
    proprietaire,
    type_essai,
    mama,
):
    demande = emettre(client_de(gerant), mama.pk).json()
    reponse = client_de(gerant).post(_url("accorder", demande), {}, format="json")
    assert reponse.status_code == 403
    reponse = client_de(proprietaire).post(_url("accorder", demande), {}, format="json")
    assert reponse.json()["statut"] == "accordee"


def test_hors_des_valideurs(client_de, responsable_production, demande):
    reponse = client_de(responsable_production).post(
        _url("accorder", demande),
        {},
        format="json",
    )
    assert reponse.status_code == 404
