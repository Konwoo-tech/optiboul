from datetime import date

import pytest
from django.urls import reverse

from optiboul.rapports.domain.accueil import taches_de_la_semaine

ACCUEIL = reverse("api:accueil")
LUNDI = date(2026, 10, 26)


def test_ma_semaine_datee():
    taches = taches_de_la_semaine(
        lundi=LUNDI,
        plan_a_valider=True,
        farine_a_payer=False,
        jours_controle_stock=["mercredi", "dimanche"],
        jours_relance=["jeudi", "samedi"],
        dettes_clients=True,
        semaine_cloturee=False,
    )
    assert [(t.cle, t.jour.isoformat(), t.faite) for t in taches] == [
        ("valider_plan", "2026-10-26", False),
        ("payer_farine", "2026-10-27", True),
        ("controle_stock_mercredi", "2026-10-28", False),
        ("relancer_dettes_jeudi", "2026-10-29", False),
        ("relancer_dettes_samedi", "2026-10-31", False),
        ("controle_stock_dimanche", "2026-11-01", False),
        ("cloturer_semaine", "2026-11-01", False),
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("qui", "ecran"),
    [
        ("caissiere", "ma_caisse"),
        ("responsable_production", "plan_du_jour"),
        ("gerant", "ma_semaine"),
        ("proprietaire", "tableau_de_bord"),
        ("administrateur", "administration"),
    ],
)
def test_ecran_d_arrivee_selon_le_profil(client_de, request, s44, horloge, qui, ecran):
    personne = request.getfixturevalue(qui)
    reponse = client_de(personne).get(ACCUEIL)
    assert reponse.status_code == 200, reponse.content
    assert reponse.json()["ecran"] == ecran


@pytest.mark.django_db
def test_ma_caisse(client_de, caissiere, caisse_ouverte):
    contenu = client_de(caissiere).get(ACCUEIL).json()["contenu"]
    assert contenu["caisse"]["attendu"] == 20_000
    assert contenu["prochaine"]["planifiee_pour_moi"] is True


@pytest.mark.django_db
def test_ma_semaine(client_de, gerant, s44, horloge):
    taches = client_de(gerant).get(ACCUEIL).json()["contenu"]["taches"]
    assert taches[0]["cle"] == "valider_plan"
    assert taches[-1]["cle"] == "cloturer_semaine"
    assert client_de(None).get(ACCUEIL).status_code == 403
