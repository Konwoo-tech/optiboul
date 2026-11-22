"""Restauration guidée d'une sauvegarde (US-143).

L'essai restaure dans une base jetable et compte les lignes, sans toucher à la base
de travail. La vraie restauration remplace celle-ci, après une copie de sécurité.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from dataclasses import dataclass
from dataclasses import field
from pathlib import Path

import psycopg
from cryptography.exceptions import InvalidTag
from django.db import connection
from psycopg import sql

from .sauvegardes import EN_TETE
from .sauvegardes import PgDump
from .sauvegardes import cle_de_chiffrement
from .sauvegardes import dechiffrer

BASE_D_ESSAI = "optiboul_essai_restauration"
TABLES_TEMOINS = (
    "matiere",
    "semaine",
    "client",
    "mouvement_compte",
    "mouvement_stock",
)
DELAI = 3600
# Totaux comparés entre la copie et la base restaurée (#304) : ils doivent être égaux.
CONTROLES = {
    "sessions": "SELECT count(*) FROM caisse",
    "soldes_clients": "SELECT coalesce(sum(sens * montant), 0) FROM mouvement_compte",
    "stocks": "SELECT count(*) FROM mouvement_stock",
}


class RestaurationImpossible(Exception):  # noqa: N818
    """Fichier illisible ou restauration refusée par PostgreSQL."""


@dataclass(frozen=True)
class RapportEssai:
    lignes: dict[str, int]  # table témoin → nombre de lignes restaurées
    totaux: dict[str, int] = field(default_factory=dict)  # contrôle → total (CONTROLES)


def _acces() -> list[str]:
    reglages = connection.settings_dict
    return [
        f"--host={reglages.get('HOST') or 'localhost'}",
        f"--port={reglages.get('PORT') or 5432}",
        f"--username={reglages.get('USER')}",
    ]


def _environnement() -> dict[str, str]:
    mot_de_passe = str(connection.settings_dict.get("PASSWORD") or "")
    return {**os.environ, "PGPASSWORD": mot_de_passe}


def _connecter(base: str) -> psycopg.Connection:
    reglages = connection.settings_dict
    return psycopg.connect(
        host=reglages.get("HOST") or "localhost",
        port=reglages.get("PORT") or 5432,
        user=reglages.get("USER"),
        password=reglages.get("PASSWORD") or "",
        dbname=base,
        autocommit=True,
    )


def _en_clair(fichier: Path, dossier: Path) -> Path:
    """Une copie cloud est déchiffrée ; un fichier modifié ou tronqué est refusé."""
    with fichier.open("rb") as source:
        chiffre = source.read(len(EN_TETE)) == EN_TETE
    if not chiffre:
        return fichier
    clair = dossier / "sauvegarde.dump"
    try:
        with fichier.open("rb") as source, clair.open("wb") as cible:
            dechiffrer(source, cible, cle_de_chiffrement())
    except (ValueError, InvalidTag) as erreur:
        message = str(erreur) or "Fichier modifié ou tronqué."
        raise RestaurationImpossible(message) from erreur
    return clair


def _pg_restore(fichier: Path, base: str, *options: str) -> None:
    commande = [
        "pg_restore",
        "--no-owner",
        "--exit-on-error",
        *options,
        *_acces(),
        f"--dbname={base}",
        str(fichier),
    ]
    resultat = subprocess.run(  # noqa: S603
        commande,
        env=_environnement(),
        capture_output=True,
        text=True,
        timeout=DELAI,
        check=False,
    )
    if resultat.returncode != 0:
        raise RestaurationImpossible(resultat.stderr.strip()[-500:])


def _base_administrative() -> str:
    """Toute base qui n'est pas celle qu'on crée ou supprime."""
    return "postgres"


def _recreer(base: str) -> None:
    with _connecter(_base_administrative()) as lien:
        identifiant = sql.Identifier(base)
        lien.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(identifiant))
        lien.execute(sql.SQL("CREATE DATABASE {}").format(identifiant))


def _supprimer(base: str) -> None:
    with _connecter(_base_administrative()) as lien:
        identifiant = sql.Identifier(base)
        lien.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(identifiant))


def essayer(fichier: Path) -> RapportEssai:
    """Restaure dans une base jetable, compte les tables témoins, puis la supprime."""
    with tempfile.TemporaryDirectory() as dossier:
        clair = _en_clair(fichier, Path(dossier))
        _recreer(BASE_D_ESSAI)
        try:
            _pg_restore(clair, BASE_D_ESSAI)
            with _connecter(BASE_D_ESSAI) as lien:
                lignes = {}
                for table in TABLES_TEMOINS:
                    requete = sql.SQL("SELECT count(*) FROM {}").format(
                        sql.Identifier(table),
                    )
                    ligne = lien.execute(requete).fetchone()
                    lignes[table] = ligne[0] if ligne else 0
                totaux = _totaux(lien)
        finally:
            _supprimer(BASE_D_ESSAI)
    return RapportEssai(lignes, totaux)


def _totaux(lien: psycopg.Connection) -> dict[str, int]:
    totaux = {}
    for nom, requete in CONTROLES.items():
        ligne = lien.execute(sql.SQL(requete)).fetchone()
        totaux[nom] = int(ligne[0]) if ligne else 0
    return totaux


def totaux_de_la_base() -> dict[str, int]:
    """Les mêmes totaux, lus dans la base de travail après la restauration."""
    with _connecter(str(connection.settings_dict["NAME"])) as lien:
        return _totaux(lien)


def restaurer(fichier: Path, copie_de_securite: Path) -> None:
    """Remplace la base de travail ; la copie permet de revenir en arrière."""
    PgDump().exporter(copie_de_securite)
    remplacer(fichier)


def remplacer(fichier: Path) -> None:
    """Remplace la base de travail en une transaction : un échec la laisse intacte."""
    with tempfile.TemporaryDirectory() as dossier:
        clair = _en_clair(fichier, Path(dossier))
        _pg_restore(
            clair,
            str(connection.settings_dict["NAME"]),
            "--clean",
            "--if-exists",
            "--single-transaction",
        )
