from datetime import UTC
from datetime import datetime
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.users import verrouillage
from optiboul.users.domain.verrouillage import DUREE_BLOCAGE
from optiboul.users.domain.verrouillage import ECHECS_MAX
from optiboul.users.domain.verrouillage import EtatVerrou
from optiboul.users.domain.verrouillage import apres_echec
from optiboul.users.domain.verrouillage import essais_par_jour_au_plus

T0 = datetime(2026, 10, 28, 20, 0, tzinfo=UTC)


def test_cinq_echecs_bloquent_quinze_minutes():
    etat = EtatVerrou(0, None)
    for _ in range(ECHECS_MAX - 1):
        etat = apres_echec(etat, T0)
        assert not etat.bloque(T0)
    etat = apres_echec(etat, T0)
    assert etat.bloque(T0)
    assert etat.bloque(T0 + DUREE_BLOCAGE - timedelta(seconds=1))
    assert not etat.bloque(T0 + DUREE_BLOCAGE)
    # Pendant le blocage, un nouvel essai ne prolonge ni ne remet à zéro.
    assert apres_echec(etat, T0 + timedelta(minutes=1)) == etat


def test_dix_mille_combinaisons_impossibles_a_enchainer():
    # 5 essais toutes les 15 minutes : 480 essais par jour au plus sur un compte,
    # soit plus de 20 jours pour essayer les 10 000 codes à 4 chiffres.
    assert essais_par_jour_au_plus() == 480
    assert 10_000 / essais_par_jour_au_plus() > 20

    # Simulation minute par minute d'un attaquant qui essaie dès que possible.
    etat, essais, instant = EtatVerrou(0, None), 0, T0
    while instant < T0 + timedelta(days=1):
        if not etat.bloque(instant):
            etat = apres_echec(etat, instant)
            essais += 1
        instant += timedelta(seconds=1)
    assert essais <= 480


@pytest.mark.django_db
def test_echecs_et_verrouillage_journalises(caissiere):
    for _ in range(ECHECS_MAX - 1):
        assert verrouillage.enregistrer_echec(caissiere, "code") is False
    assert verrouillage.enregistrer_echec(caissiere, "code") is True
    assert verrouillage.est_bloque(caissiere)
    actions = list(LigneJournal.objects.order_by("id").values_list("action", flat=True))
    assert actions == ["connexion.echec"] * ECHECS_MAX + ["connexion.verrouillage"]


@pytest.mark.django_db
def test_l_administrateur_debloque(client_de, administrateur, caissiere):
    caissiere.bloque_jusqua = timezone.now() + timedelta(minutes=10)
    caissiere.echecs_connexion = 0
    caissiere.save()
    url = reverse("api:utilisateur-debloquer", kwargs={"pk": caissiere.pk})
    assert client_de(caissiere).post(url).status_code == 403
    reponse = client_de(administrateur).post(url)
    assert reponse.status_code == 200
    assert reponse.json()["bloque"] is False
    caissiere.refresh_from_db()
    assert not verrouillage.est_bloque(caissiere)
    assert LigneJournal.objects.get(action="compte.debloque").acteur == administrateur


@pytest.mark.django_db
def test_mot_de_passe_faux_trace(client, user):
    client.post(reverse("account_login"), {"login": user.email, "password": "faux"})
    ligne = LigneJournal.objects.get(action="connexion.echec")
    assert ligne.apres == {"methode": "mot_de_passe", "compte": user.email}
