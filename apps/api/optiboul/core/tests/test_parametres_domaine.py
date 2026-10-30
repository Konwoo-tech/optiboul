import pytest

from optiboul.core.domain.parametres import CATALOGUE
from optiboul.core.domain.parametres import PAR_CLE
from optiboul.core.domain.parametres import ValeurInvalide
from optiboul.core.domain.parametres import definition


def test_le_catalogue_reprend_les_valeurs_par_defaut_du_cahier_des_charges():
    attendus = {
        "plafond_dette_client": 2_000,
        "echeance_dettes": "dimanche",
        "relances_jours": ["jeudi", "samedi"],
        "relances_heure": "10:00",
        "fonds_caisse": 20_000,
        "plafond_especes": 100_000,
        "seuil_validation_depenses": 50_000,
        "seuil_budget_surveiller": 80,
        "ecart_matiere_kg_par_sac": 2,
        "ecart_matiere_grammes": 4,
        "tolerance_inventaire": 5,
        "tolerance_validation_plan": 10,
        "heure_limite_commandes_nuit": "18:30",
        "heure_limite_commandes_jour": "05:30",
        "heure_petrissage_nuit": "19:00",
        "heure_petrissage_jour": "06:30",
        "echeance_demande_plafond": 10,
        "inactivite_comptoir": 5,
        "sauvegarde_locale": 4,
        "alerte_sauvegarde_cloud": 48,
        "prix_sac_farine": 19_525,
        "demande_estimee_sessions": 4,
        "supplement_auto_sacs": 1,
        "supplement_auto_pourcentage": 10,
        "rappel_clients_habituels": 30,
        "stock_sessions_bas": 2,
        "stock_sessions_commande": 6,
        "controles_stock_jours": ["mercredi", "dimanche"],
    }
    assert {d.cle: d.defaut for d in CATALOGUE} == attendus
    for item in CATALOGUE:
        assert item.valider(item.defaut) == item.defaut


@pytest.mark.parametrize(
    ("cle", "valeur"),
    [
        ("fonds_caisse", -1),
        ("fonds_caisse", 1.5),
        ("fonds_caisse", True),
        ("fonds_caisse", "20000"),
        ("seuil_budget_surveiller", 101),
        ("inactivite_comptoir", 7),
        ("relances_heure", "25:00"),
        ("relances_heure", 10),
        ("echeance_dettes", "dimanche prochain"),
        ("relances_jours", []),
        ("relances_jours", ["jeudi", "jour férié"]),
        ("sauvegarde_locale", 0),
        ("sauvegarde_locale", 25),
    ],
)
def test_valeurs_refusees(cle, valeur):
    with pytest.raises(ValeurInvalide):
        definition(cle).valider(valeur)


def test_jours_remis_dans_l_ordre_de_la_semaine_sans_doublon():
    assert PAR_CLE["relances_jours"].valider(["samedi", "jeudi", "samedi"]) == [
        "jeudi",
        "samedi",
    ]


def test_parametre_inconnu():
    with pytest.raises(ValeurInvalide, match="inconnu"):
        definition("tva")
