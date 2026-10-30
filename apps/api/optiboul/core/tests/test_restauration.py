import base64
import os
from io import StringIO
from unittest import mock

import pytest
from django.core.management import CommandError
from django.core.management import call_command
from django.db import connection

from optiboul.core.infrastructure.restauration import BASE_D_ESSAI
from optiboul.core.infrastructure.restauration import RestaurationImpossible
from optiboul.core.infrastructure.restauration import _connecter
from optiboul.core.infrastructure.restauration import _pg_restore
from optiboul.core.infrastructure.restauration import _recreer
from optiboul.core.infrastructure.restauration import _supprimer
from optiboul.core.infrastructure.restauration import essayer
from optiboul.core.infrastructure.sauvegardes import PgDump
from optiboul.core.infrastructure.sauvegardes import chiffrer

CLE = base64.urlsafe_b64encode(bytes(range(32))).decode()

pytestmark = pytest.mark.django_db


@pytest.fixture
def copie(tmp_path):
    chemin = tmp_path / "copie.dump"
    PgDump().exporter(chemin)
    return chemin


def test_essai_compte_sans_toucher_la_base(copie):
    assert essayer(copie).lignes["matiere"] > 0
    with connection.cursor() as curseur:
        curseur.execute("SELECT 1 FROM pg_database WHERE datname LIKE '%essai%'")
        assert curseur.fetchone() is None


def test_remplace_une_base_existante(copie):
    """Les options de la vraie restauration, sur une base jetable : ce qui a été
    écrit après la copie disparaît."""
    _recreer(BASE_D_ESSAI)
    try:
        _pg_restore(copie, BASE_D_ESSAI)
        with _connecter(BASE_D_ESSAI) as lien:
            avant = lien.execute("SELECT count(*) FROM matiere").fetchone()
            lien.execute("UPDATE matiere SET nom = 'Modifié'")
            lien.execute("ALTER TABLE matiere ADD COLUMN apres_la_copie int")
        _pg_restore(
            copie,
            BASE_D_ESSAI,
            "--clean",
            "--if-exists",
            "--single-transaction",
        )
        with _connecter(BASE_D_ESSAI) as lien:
            assert lien.execute("SELECT count(*) FROM matiere").fetchone() == avant
            colonnes = lien.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE column_name = 'apres_la_copie'",
            ).fetchone()
            assert colonnes is None
            modifiee = lien.execute(
                "SELECT 1 FROM matiere WHERE nom = 'Modifié'",
            ).fetchone()
            assert modifiee is None
    finally:
        _supprimer(BASE_D_ESSAI)


def test_copie_chiffree(copie, tmp_path, settings):
    settings.OPTIBOUL_CLE_SAUVEGARDE = CLE
    chiffree = tmp_path / "copie.dump.chiffre"
    with copie.open("rb") as source, chiffree.open("wb") as cible:
        chiffrer(source, cible, base64.urlsafe_b64decode(CLE))
    assert essayer(chiffree).lignes["matiere"] > 0


def test_fichier_modifie_refuse(copie, tmp_path, settings):
    settings.OPTIBOUL_CLE_SAUVEGARDE = CLE
    chiffree = tmp_path / "copie.dump.chiffre"
    with copie.open("rb") as source, chiffree.open("wb") as cible:
        chiffrer(source, cible, base64.urlsafe_b64decode(CLE))
    contenu = bytearray(chiffree.read_bytes())
    contenu[-1] ^= 0xFF
    chiffree.write_bytes(contenu)
    with pytest.raises(RestaurationImpossible):
        essayer(chiffree)


def test_fichier_illisible(tmp_path):
    faux = tmp_path / "faux.dump"
    faux.write_bytes(os.urandom(64))
    with pytest.raises(RestaurationImpossible):
        essayer(faux)


def test_commande_sans_confirmation_ne_restaure_pas(copie):
    sortie = StringIO()
    with mock.patch(
        "optiboul.core.management.commands.restaurer_sauvegarde.restaurer",
    ) as restaurer:
        call_command("restaurer_sauvegarde", str(copie), stdout=sortie)
    restaurer.assert_not_called()
    assert "Essai réussi" in sortie.getvalue()


def test_commande_confirmee_restaure(copie, tmp_path, settings):
    settings.OPTIBOUL_DOSSIER_SAUVEGARDES = str(tmp_path)
    with mock.patch(
        "optiboul.core.management.commands.restaurer_sauvegarde.restaurer",
    ) as restaurer:
        call_command(
            "restaurer_sauvegarde",
            str(copie),
            confirmer="REMPLACER-LA-BASE",
            stdout=StringIO(),
        )
    restaurer.assert_called_once()


def test_fichier_absent(tmp_path):
    with pytest.raises(CommandError, match="introuvable"):
        call_command("restaurer_sauvegarde", str(tmp_path / "absent.dump"))
