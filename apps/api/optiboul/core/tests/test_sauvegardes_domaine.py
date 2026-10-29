from datetime import UTC
from datetime import datetime
from datetime import timedelta

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import a_supprimer
from optiboul.core.domain.sauvegardes import copie_cloud_en_retard
from optiboul.core.domain.sauvegardes import nom_fichier
from optiboul.core.domain.sauvegardes import sauvegarde_due

MAINTENANT = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


def test_sauvegarde_due_toutes_les_4_heures():
    assert sauvegarde_due(None, MAINTENANT, 4)
    assert not sauvegarde_due(
        MAINTENANT - timedelta(hours=3, minutes=59),
        MAINTENANT,
        4,
    )
    assert sauvegarde_due(MAINTENANT - timedelta(hours=4), MAINTENANT, 4)


def test_alerte_au_dela_de_48_heures_sans_copie_cloud():
    assert copie_cloud_en_retard(None, MAINTENANT, 48)
    assert not copie_cloud_en_retard(MAINTENANT - timedelta(hours=48), MAINTENANT, 48)
    assert copie_cloud_en_retard(
        MAINTENANT - timedelta(hours=48, seconds=1),
        MAINTENANT,
        48,
    )


def test_nom_de_fichier():
    assert (
        nom_fichier(MAINTENANT, Declencheur.CLOTURE_CAISSE)
        == "optiboul-20261028-120000-cloture_caisse.dump"
    )


def test_conservation_garde_toujours_les_plus_recentes():
    fichiers = {f"f{i}": MAINTENANT - timedelta(days=i * 5) for i in range(10)}
    # Plus de 14 jours : f3 à f9 ; les 6 plus récentes (f0 à f5) restent.
    assert sorted(a_supprimer(fichiers, MAINTENANT, 14)) == ["f6", "f7", "f8", "f9"]
    assert a_supprimer(fichiers, MAINTENANT, 14, garder_au_moins=20) == []
