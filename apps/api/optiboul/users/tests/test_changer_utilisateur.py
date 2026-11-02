from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from optiboul.core.application.journal import SYSTEME
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.parametres import depot_parametres
from optiboul.users import connexion
from optiboul.users import postes
from optiboul.users.inactivite import SESSION_ACTIVITE
from optiboul.users.tests.factories import poste_de_confiance

pytestmark = pytest.mark.django_db

CODE = reverse("api:connexion-code")
CHANGER = reverse("api:connexion-changer-utilisateur")
SESSION = reverse("api:connexion-session")
MOI = reverse("api:user-me")
SANTE = reverse("api:sante")


def _brouillon(cle: str) -> str:
    return reverse("api:brouillon-detail", kwargs={"cle": cle})


@pytest.fixture
def comptoir() -> APIClient:
    client = APIClient()
    client.cookies[postes.COOKIE] = poste_de_confiance()
    return client


@pytest.fixture
def equipe(caissiere, responsable_production):
    connexion.definir_code(caissiere, "4821")
    connexion.definir_code(responsable_production, "7310")
    return caissiere, responsable_production


def _connecter(client: APIClient, utilisateur, code: str) -> None:
    reponse = client.post(
        CODE,
        {"utilisateur": utilisateur.pk, "code": code},
        format="json",
    )
    assert reponse.json() == {"deuxFacteurs": False}


def test_le_brouillon_reste_a_son_auteur(comptoir, equipe):
    rachel, serge = equipe
    _connecter(comptoir, rachel, "4821")
    saisie = {"client": "Boutique White", "baguettes": 40}
    comptoir.put(_brouillon("comptoir.livraison"), {"contenu": saisie}, format="json")

    assert comptoir.post(CHANGER).status_code == 204
    assert comptoir.get(MOI).status_code == 403
    _connecter(comptoir, serge, "7310")
    assert comptoir.get(reverse("api:brouillon-list")).json() == []
    assert comptoir.get(_brouillon("comptoir.livraison")).status_code == 404

    comptoir.post(CHANGER)
    _connecter(comptoir, rachel, "4821")
    assert comptoir.get(_brouillon("comptoir.livraison")).json()["contenu"] == saisie
    assert comptoir.delete(_brouillon("comptoir.livraison")).status_code == 204
    assert LigneJournal.objects.filter(action="connexion.changement").count() == 2


def _vieillir_la_session(client: APIClient, minutes: int) -> None:
    session = client.session
    session[SESSION_ACTIVITE] = (
        timezone.now() - timedelta(minutes=minutes)
    ).isoformat()
    session.save()


def test_deconnexion_apres_l_inactivite_parametree(comptoir, equipe):
    rachel, _ = equipe
    _connecter(comptoir, rachel, "4821")
    assert comptoir.get(SESSION).json() == {"via": "code", "inactiviteMinutes": 5}
    _vieillir_la_session(comptoir, 4)
    assert comptoir.get(MOI).status_code == 200
    _vieillir_la_session(comptoir, 6)
    assert comptoir.get(MOI).status_code == 403
    trace = LigneJournal.objects.get(action="connexion.expiree")
    assert trace.acteur == rachel


def test_le_delai_suit_le_parametre(comptoir, equipe):
    from optiboul.core.application.parametres import modifier  # noqa: PLC0415

    modifier(
        depot_parametres,
        journal,
        cle="inactivite_comptoir",
        valeur=15,
        auteur=SYSTEME,
    )
    rachel, _ = equipe
    _connecter(comptoir, rachel, "4821")
    _vieillir_la_session(comptoir, 10)
    assert comptoir.get(MOI).status_code == 200


def test_le_controle_de_sante_ne_prolonge_pas_la_session(comptoir, equipe):
    rachel, _ = equipe
    _connecter(comptoir, rachel, "4821")
    _vieillir_la_session(comptoir, 4)
    comptoir.get(SANTE)
    _vieillir_la_session(comptoir, 6)
    comptoir.get(SANTE)
    assert comptoir.get(MOI).status_code == 403


def test_une_session_par_email_ne_suit_pas_le_delai_du_comptoir(client_de, gerant):
    client = APIClient()
    client.force_login(gerant)
    _vieillir_la_session(client, 60)
    assert client.get(MOI).status_code == 200
