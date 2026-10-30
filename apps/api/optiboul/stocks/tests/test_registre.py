from decimal import Decimal

import pytest
from django.db import DatabaseError
from django.db import transaction

from optiboul.stocks.domain.stocks import Sens
from optiboul.stocks.domain.stocks import sorties_de_production
from optiboul.stocks.domain.stocks import stock
from optiboul.stocks.infrastructure.models import MouvementStock


def test_le_stock_est_la_somme_des_mouvements():
    assert stock(
        [(Sens.ENTREE, Decimal(500)), (Sens.SORTIE, Decimal("205.5"))],
    ) == Decimal(
        "294.5",
    )


def test_sorties_des_seules_matieres_suivies():
    assert sorties_de_production(
        {"farine": Decimal(205), "eau": Decimal(110), "sel": Decimal(0)},
        {"farine", "sel"},
    ) == {"farine": Decimal(205)}


pytestmark = pytest.mark.django_db


def test_registre_en_ajout_seul(s44, gerant):
    from optiboul.stocks.infrastructure.models import Matiere  # noqa: PLC0415

    MouvementStock.objects.create(
        matiere=Matiere.objects.get(code="farine"),
        sens=1,
        quantite=Decimal(50),
        genre="correction",
        source_type="essai",
        source_id=0,
        semaine=s44,
        auteur=gerant,
    )
    with pytest.raises(DatabaseError, match="ajout seul"), transaction.atomic():
        MouvementStock.objects.update(quantite=1)
    with pytest.raises(DatabaseError, match="ajout seul"), transaction.atomic():
        MouvementStock.objects.all().delete()
