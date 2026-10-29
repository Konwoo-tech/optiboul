from datetime import UTC
from datetime import datetime
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.clients.domain.clients import texte_relance
from optiboul.clients.infrastructure.models import Relance
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.templatetags.optiboul import fcfa
from optiboul.notifications.infrastructure.envois import envoyer_en_attente
from optiboul.notifications.infrastructure.models import MessageSortant

GROUPE = reverse("api:client-relancer-groupe")


def test_texte_de_la_relance():
    assert texte_relance("Mama Rasta", "dimanche", fcfa(1_500)) == (
        "Bonjour Mama Rasta, la Boulangerie du Faubourg vous rappelle votre solde "
        f"de {fcfa(1_500)}, à régler au plus tard dimanche. Merci !"
    )


@pytest.mark.django_db
def test_relance_individuelle(client_de, gerant, comptes):
    mama = comptes["Mama Rasta"]
    reponse = client_de(gerant).post(
        reverse("api:client-relancer", kwargs={"pk": mama.pk}),
    )
    assert reponse.status_code == 200, reponse.content
    relance = reponse.json()["relances"][0]
    assert relance["client"] == {"id": mama.pk, "nom": "Mama Rasta"}
    assert (relance["motif"], relance["montant"]) == ("dette", 1_500)
    assert relance["auteur"] == "Willy"
    assert relance["envoi"] == {"statut": "en_attente", "envoye_le": None}
    message = MessageSortant.objects.get()
    assert (message.canal, message.destinataire) == ("whatsapp", "699112233")
    assert message.contenu.startswith("Bonjour Mama Rasta")


@pytest.mark.django_db
def test_relance_groupee_et_statut_d_envoi(client_de, proprietaire, comptes, settings):
    ids = [client.pk for client in comptes.values()]
    reponse = client_de(proprietaire).post(GROUPE, {"clients": ids}, format="json")
    resultat = reponse.json()
    assert [r["client"]["nom"] for r in resultat["relances"]] == ["Mama Rasta"]
    assert sorted((i["nom"], i["raison"]) for i in resultat["ignores"]) == [
        ("Rachel Boutique", "sans_dette"),
        ("Raoul", "sans_telephone"),
    ]
    trace = LigneJournal.objects.get(action="clients.relances")
    assert trace.apres == {
        "clients": [comptes["Mama Rasta"].pk],
        "total": 1_500,
        "automatique": False,
    }
    # Au retour du réseau, l'état de l'envoi suit.
    passerelles = "optiboul.notifications.infrastructure.envois"
    settings.OPTIBOUL_PASSERELLES = {
        "whatsapp": f"{passerelles}.PasserelleJournalisation",
    }
    with mock.patch(
        "django.utils.timezone.now",
        return_value=datetime(2100, 1, 1, tzinfo=UTC),
    ):
        envoyer_en_attente()
    url = reverse("api:client-relances", kwargs={"pk": comptes["Mama Rasta"].pk})
    assert client_de(proprietaire).get(url).json()[0]["envoi"]["statut"] == "envoye"
    dettes = client_de(proprietaire).get(reverse("api:client-dettes")).json()
    mama = next(c for c in dettes["clients"] if c["nom"] == "Mama Rasta")
    assert mama["derniere_relance"]["envoi"]["statut"] == "envoye"


@pytest.mark.django_db
def test_seuls_gerant_et_proprietaire_relancent(client_de, caissiere, comptes):
    reponse = client_de(caissiere).post(
        GROUPE,
        {"clients": [comptes["Mama Rasta"].pk]},
        format="json",
    )
    assert reponse.status_code == 403
    assert not Relance.objects.exists()
