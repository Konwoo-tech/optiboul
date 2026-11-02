import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.notifications.infrastructure.envois import notificateur
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.notifications.infrastructure.models import Notification

pytestmark = pytest.mark.django_db

LISTE = reverse("api:notification-list")
COMPTEUR = reverse("api:notification-non-lues")


def test_seulement_aux_roles_concernes(
    caissiere,
    gerant,
    responsable_production,
    proprietaire,
):
    nombre = notificateur.notifier_type(
        "plan.demande_superieure",
        titre="Demande estimée au-dessus du plan",
        message="BAG : 2 sacs de plus",
        lien="/atelier/production",
    )
    assert nombre == 3
    destinataires = set(
        Notification.objects.values_list("destinataire__name", flat=True),
    )
    assert destinataires == {"Serge", "Willy", "Fotso"}
    assert not MessageSortant.objects.exists()


def test_compteur_et_lecture(client_de, gerant, caissiere):
    for titre in ("Plan proposé", "Production clôturée"):
        notificateur.notifier(
            [gerant.pk],
            genre="plan.propose",
            titre=titre,
            lien="/atelier",
        )
    notificateur.notifier([caissiere.pk], genre="plan.valide", titre="Pour Rachel")
    assert client_de(gerant).get(COMPTEUR).json() == {"non_lues": 2}
    mes = client_de(gerant).get(LISTE).json()["results"]
    assert [n["titre"] for n in mes] == ["Production clôturée", "Plan proposé"]
    assert mes[0]["lien"] == "/atelier"
    lue = client_de(gerant).post(
        reverse("api:notification-marquer-lue", kwargs={"pk": mes[0]["id"]}),
    )
    assert lue.json()["lue"] is True
    assert client_de(gerant).get(COMPTEUR).json() == {"non_lues": 1}
    assert client_de(gerant).get(LISTE, {"non_lues": "true"}).json()["count"] == 1
    tout = client_de(gerant).post(reverse("api:notification-tout-marquer-lu"))
    assert tout.json() == {"marquees": 1}
    # Rachel garde la sienne, et ne voit pas celles du gérant.
    assert client_de(caissiere).get(COMPTEUR).json() == {"non_lues": 1}
    autre = reverse("api:notification-marquer-lue", kwargs={"pk": mes[0]["id"]})
    assert client_de(caissiere).post(autre).status_code == 404


def test_envoi_complementaire_selon_le_parametrage(
    client_de,
    proprietaire,
    gerant,
    caissiere,
):
    gerant.telephone = "677000001"
    gerant.save()
    url = reverse("api:regle-notification-detail", kwargs={"genre": "plan.provisoire"})
    assert client_de(gerant).put(url, {}, format="json").status_code == 403
    reponse = client_de(proprietaire).put(
        url,
        {"profils": ["gerant", "proprietaire"], "canaux": ["whatsapp"]},
        format="json",
    )
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["canaux"] == ["application", "whatsapp"]
    trace = LigneJournal.objects.get(action="notification.regle_modifiee")
    assert trace.avant == {
        "profils": ["gerant", "proprietaire"],
        "canaux": ["application"],
    }
    notificateur.notifier_type("plan.provisoire", titre="Production provisoire")
    message = MessageSortant.objects.get()
    assert (message.canal, message.destinataire) == ("whatsapp", "677000001")
    assert message.contenu == "OptiBoul : Production provisoire."


def test_table_de_routage(client_de, administrateur):
    regles = (
        client_de(administrateur).get(reverse("api:regle-notification-list")).json()
    )
    par_genre = {r["genre"]: r for r in regles}
    assert par_genre["semaine.publiee"]["profils"] == [
        "caissier",
        "gerant",
        "production",
        "proprietaire",
        "administrateur",
    ]
    assert par_genre["production.reste_a_produire"]["libelle"] == "Reste à produire"
    inconnu = reverse("api:regle-notification-detail", kwargs={"genre": "inconnu"})
    reponse = client_de(administrateur).put(
        inconnu,
        {"profils": [], "canaux": []},
        format="json",
    )
    assert reponse.status_code == 404
