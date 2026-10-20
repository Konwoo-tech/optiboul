from hypothesis import given
from hypothesis import strategies as st

from optiboul.caisse.domain.regles import StatutEcart
from optiboul.caisse.domain.regles import ecart_caisse
from optiboul.caisse.domain.regles import remise_coffre_proposee

montants = st.integers(min_value=0, max_value=10_000_000)


def test_caisse_juste():
    resultat = ecart_caisse(
        fonds=20_000,
        especes=150_000,
        depenses=5_000,
        remises=100_000,
        compte=65_000,
    )
    assert resultat.attendu == 65_000
    assert resultat.statut is StatutEcart.JUSTE


def test_caisse_en_manque():
    resultat = ecart_caisse(
        fonds=20_000,
        especes=10_000,
        depenses=0,
        remises=0,
        compte=29_500,
    )
    assert resultat.ecart == -500
    assert resultat.statut is StatutEcart.MANQUE


@given(
    fonds=montants,
    especes=montants,
    depenses=montants,
    remises=montants,
    compte=montants,
)
def test_ecart_est_compte_moins_attendu(fonds, especes, depenses, remises, compte):
    resultat = ecart_caisse(fonds, especes, depenses, remises, compte)
    assert resultat.ecart == compte - (fonds + especes - depenses - remises)
    assert (resultat.ecart == 0) == (resultat.statut is StatutEcart.JUSTE)


def test_remise_au_coffre_au_dela_du_plafond():
    assert not remise_coffre_proposee(100_000, plafond_especes=100_000)
    assert remise_coffre_proposee(100_001, plafond_especes=100_000)
