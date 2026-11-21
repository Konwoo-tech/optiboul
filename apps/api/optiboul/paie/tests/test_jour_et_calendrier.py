"""Jour de paie par mois, calendrier, employé et valideur sur l'état (#353)."""

from datetime import date
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.infrastructure.models import LigneJournal
from optiboul.demandes.infrastructure.models import Demande
from optiboul.paie.infrastructure.models import EtatPaie

pytestmark = pytest.mark.django_db

CALENDRIER = reverse("api:paie-calendrier")


def _jour(paie):
    return reverse("api:paie-jour", kwargs={"pk": paie["id"]})


def _detail(client, paie):
    return client.get(reverse("api:paie-detail", kwargs={"pk": paie["id"]})).json()


def test_jour_par_defaut_puis_propre_au_mois(client_de, gerant, paie):
    assert paie["jour_de_paie"] == "2026-10-28"  # paramètre jour_de_paie
    reponse = client_de(gerant).put(_jour(paie), {"jour": "2026-10-10"}, format="json")
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["jour_de_paie"] == "2026-10-10"
    assert EtatPaie.objects.get().jour_de_paie == date(2026, 10, 10)
    ligne = LigneJournal.objects.get(action="paie.jour_modifie")
    assert (ligne.avant, ligne.apres) == (
        {"jour": "2026-10-28"},
        {"jour": "2026-10-10"},
    )


def test_jour_hors_du_mois_refuse(client_de, gerant, paie):
    reponse = client_de(gerant).put(_jour(paie), {"jour": "2026-11-02"}, format="json")
    assert (reponse.status_code, reponse.json()["code"]) == (409, "jour_hors_du_mois")


def test_apres_soumission_seul_le_proprietaire(client_de, gerant, proprietaire, paie):
    client_de(gerant).post(reverse("api:paie-soumettre", kwargs={"pk": paie["id"]}))
    reponse = client_de(gerant).put(_jour(paie), {"jour": "2026-10-12"}, format="json")
    assert reponse.json()["code"] == "paie_non_brouillon"
    reponse = client_de(proprietaire).put(
        _jour(paie),
        {"jour": "2026-10-12"},
        format="json",
    )
    assert reponse.status_code == 200
    assert reponse.json()["jour_de_paie"] == "2026-10-12"


def test_caisse_et_production_ne_fixent_pas_le_jour(
    client_de,
    caissiere,
    responsable_production,
    paie,
):
    for personne in (caissiere, responsable_production):
        reponse = client_de(personne).put(
            _jour(paie),
            {"jour": "2026-10-12"},
            format="json",
        )
        assert reponse.status_code == 403


def test_ligne_porte_l_employe_et_son_poste(client_de, gerant, paie, mireille):
    mireille.poste = "Vendeuse"
    mireille.save()
    lignes = _detail(client_de(gerant), paie)["lignes"]
    ligne = next(ligne for ligne in lignes if ligne["employe"] == "Mireille Ngo")
    assert (ligne["employe_id"], ligne["poste"]) == (mireille.pk, "Vendeuse")


def test_soumis_valide_et_demande_liee(client_de, gerant, proprietaire, paie):
    client = client_de(gerant)
    etat = _detail(client, paie)
    assert (etat["soumis_par"], etat["valide_par"], etat["demande"]) == (
        None,
        None,
        None,
    )
    client.post(reverse("api:paie-soumettre", kwargs={"pk": paie["id"]}))
    demande = Demande.objects.get(type="paie")
    etat = _detail(client, paie)
    assert etat["soumis_par"] == "Willy"
    assert etat["valide_par"] is None
    assert etat["demande"] == {
        "id": demande.pk,
        "numero": demande.numero,
        "statut": "en_attente",
    }
    client_de(proprietaire).post(
        reverse("api:demande-accorder", kwargs={"pk": demande.pk}),
        {},
        format="json",
    )
    etat = _detail(client, paie)
    assert etat["statut"] == "valide"
    assert etat["valide_par"] == proprietaire.name
    assert etat["valide_le"] is not None
    assert etat["demande"]["statut"] == "accordee"


def test_calendrier(client_de, gerant, paie):
    with mock.patch(
        "optiboul.paie.api.paies.timezone.localdate",
        return_value=date(2026, 11, 20),
    ):
        mois = client_de(gerant).get(CALENDRIER).json()
    assert [m["mois"] for m in mois] == ["2026-10", "2026-11", "2026-12", "2027-01"]
    octobre = mois[0]
    assert octobre["etat"] == paie["id"]
    assert octobre["statut"] == "en_retard"
    assert octobre["total"] == 178_000
    assert octobre["impayes"] == 178_000
    assert octobre["jour"] == "2026-10-28"
    assert octobre["jours"] == []
    novembre = mois[1]
    assert (novembre["etat"], novembre["statut"], novembre["total"]) == (
        None,
        "courante",
        0,
    )
    assert novembre["jour"] == "2026-11-28"
    assert mois[3]["statut"] == "a_venir"


def test_calendrier_reserve_a_la_direction(client_de, caissiere):
    assert client_de(caissiere).get(CALENDRIER).status_code == 403
