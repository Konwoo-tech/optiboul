from datetime import UTC
from datetime import datetime
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.templatetags.optiboul import fcfa
from optiboul.notifications.infrastructure.envois import envoyer_en_attente
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.ventes.infrastructure import bons
from optiboul.ventes.infrastructure.models import Livraison

from .test_livraisons import livrer

pytestmark = pytest.mark.django_db
PLUS_TARD = datetime(2100, 1, 1, tzinfo=UTC)


@pytest.fixture
def livraison(client_de, caissiere, caisse, rachel_boutique) -> Livraison:
    rachel_boutique.telephone = "677412018"
    rachel_boutique.save()
    reponse = livrer(
        client_de(caissiere),
        {
            "client": rachel_boutique.pk,
            "lignes": {"BAG": 100, "KO": 10},
            "paiement": {"mode": "mtn", "montant": 5_000, "reference": "MP-1"},
        },
    )
    return Livraison.objects.get(pk=reponse.json()["id"])


def test_texte_du_bon(livraison):
    assert bons.texte(livraison).splitlines() == [
        "Boulangerie du Faubourg · Etoudi, Yaoundé",
        "Bon de livraison n° 1 du 27/10/2026 à 08:00",
        "Client : Rachel Boutique",
        "",
        f"BAG : 100 à {fcfa(95)} = {fcfa(9_500)}",
        f"KO : 10 à {fcfa(70)} = {fcfa(700)}",
        "",
        f"Montant dû : {fcfa(10_200)}",
        f"Reçu : {fcfa(5_000)}",
        f"Solde après livraison : {fcfa(-5_200)}",
    ]


def test_bon_en_pdf(client_de, caissiere, livraison):
    reponse = client_de(caissiere).get(
        reverse("api:livraison-bon", kwargs={"pk": livraison.pk}),
    )
    assert reponse.status_code == 200
    assert reponse["Content-Type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")
    assert 'filename="bon-1.pdf"' in reponse["Content-Disposition"]
    assert "MTN MoMo · MP-1" in bons.html(livraison)


def test_bon_par_whatsapp_mis_en_file(client_de, caissiere, livraison, settings):
    url = reverse("api:livraison-envoyer-whatsapp", kwargs={"pk": livraison.pk})
    reponse = client_de(caissiere).post(url)
    assert reponse.status_code == 202, reponse.content
    envoi = reponse.json()
    assert envoi["canal"] == "whatsapp"
    assert envoi["destinataire"] == "+237 6 •• •• 20 18"
    assert envoi["statut"] == "en_attente"
    message = MessageSortant.objects.get()
    assert (message.objet_type, message.objet_id) == ("livraison", livraison.pk)
    assert message.contenu == bons.texte(livraison)
    assert LigneJournal.objects.filter(action="livraison.bon_envoye").exists()
    detail = reverse("api:livraison-detail", kwargs={"pk": livraison.pk})
    assert (
        client_de(caissiere).get(detail).json()["envoi_whatsapp"]["statut"]
        == "en_attente"
    )
    # Au retour du réseau, la file part et l'état suit.
    passerelles = "optiboul.notifications.infrastructure.envois"
    settings.OPTIBOUL_PASSERELLES = {
        "whatsapp": f"{passerelles}.PasserelleJournalisation",
    }
    # La file compare à l'heure réelle : on se place après l'enregistrement.
    with mock.patch("django.utils.timezone.now", return_value=PLUS_TARD):
        assert envoyer_en_attente() == 1
    assert (
        client_de(caissiere).get(detail).json()["envoi_whatsapp"]["statut"] == "envoye"
    )


def test_client_sans_numero(client_de, caissiere, caisse, mama):
    reponse = livrer(client_de(caissiere), {"client": mama.pk, "lignes": {"BAG": 1}})
    url = reverse("api:livraison-envoyer-whatsapp", kwargs={"pk": reponse.json()["id"]})
    reponse = client_de(caissiere).post(url)
    assert reponse.status_code == 409
    assert reponse.json()["code"] == "client_sans_telephone"


def test_pas_de_bon_pour_une_livraison_en_attente(client_de, caissiere, caisse, mama):
    mama.telephone = "699112233"
    mama.save()
    reponse = livrer(
        client_de(caissiere),
        {"client": mama.pk, "lignes": {"BAG": 30}, "demander_autorisation": "Samedi"},
    )
    url = reverse("api:livraison-envoyer-whatsapp", kwargs={"pk": reponse.json()["id"]})
    assert client_de(caissiere).post(url).json()["code"] == "livraison_non_livree"
