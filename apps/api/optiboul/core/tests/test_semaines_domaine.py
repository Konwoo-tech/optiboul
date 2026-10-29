from datetime import date
from datetime import datetime

from optiboul.core.domain.semaines import FUSEAU
from optiboul.core.domain.semaines import bornes
from optiboul.core.domain.semaines import code
from optiboul.core.domain.semaines import conflits_affectation
from optiboul.core.domain.semaines import precedente
from optiboul.core.domain.semaines import proposer_rotation
from optiboul.core.domain.semaines import semaine_de
from optiboul.core.domain.semaines import suivante


def test_la_semaine_va_du_lundi_6h_au_lundi_6h():
    s44 = bornes(2026, 44)
    assert s44.debut == datetime(2026, 10, 26, 6, 0, tzinfo=FUSEAU)
    assert s44.fin == datetime(2026, 11, 2, 6, 0, tzinfo=FUSEAU)
    assert (s44.du, s44.au) == (date(2026, 10, 26), date(2026, 11, 1))
    assert len(s44.jours) == 7


def test_avant_lundi_6h_on_est_encore_dans_la_semaine_precedente():
    assert semaine_de(datetime(2026, 11, 2, 5, 59, tzinfo=FUSEAU)) == (2026, 44)
    assert semaine_de(datetime(2026, 11, 2, 6, 0, tzinfo=FUSEAU)) == (2026, 45)


def test_semaines_voisines_y_compris_au_changement_d_annee():
    assert precedente(2026, 44) == (2026, 43)
    assert suivante(2026, 53) == (2027, 1)
    assert precedente(2027, 1) == (2026, 53)
    assert code(7) == "S07"


def test_rotation_proposee():
    assert proposer_rotation([3, 5, 9], 5) == 9
    assert proposer_rotation([3, 5, 9], 9) == 3
    assert proposer_rotation([3, 5, 9], None) == 3
    assert proposer_rotation([3, 5, 9], 42) == 3
    assert proposer_rotation([], 5) is None


def test_conflits_signales():
    assert conflits_affectation(
        gerant=1,
        production=2,
        gerant_precedent=1,
        production_precedente=3,
        inactifs={2},
    ) == ["gerant_deux_semaines_de_suite", "compte_inactif"]
    assert (
        conflits_affectation(
            gerant=None,
            production=None,
            gerant_precedent=None,
            production_precedente=None,
            inactifs=set(),
        )
        == []
    )
