from hypothesis import given
from hypothesis import strategies as st

from optiboul.ventes.domain.regles import verifier_plafond

PLAFOND = 2_000
montants = st.integers(min_value=0, max_value=10_000_000)


def test_client_a_jour_livre_sous_le_plafond():
    resultat = verifier_plafond(
        solde_avant=0,
        montant_du=1_500,
        recu=0,
        plafond=PLAFOND,
    )
    assert resultat.autorise
    assert resultat.manque == 0


def test_depassement_indique_le_manque_a_encaisser():
    resultat = verifier_plafond(
        solde_avant=-1_000,
        montant_du=3_000,
        recu=0,
        plafond=PLAFOND,
    )
    assert not resultat.autorise
    assert resultat.manque == 2_000


@given(solde_avant=st.integers(-PLAFOND, 1_000_000), montant_du=montants, recu=montants)
def test_encaisser_le_manque_debloque_toujours(solde_avant, montant_du, recu):
    resultat = verifier_plafond(solde_avant, montant_du, recu, PLAFOND)
    apres = verifier_plafond(solde_avant, montant_du, recu + resultat.manque, PLAFOND)
    assert apres.autorise
    assert resultat.manque >= 0
