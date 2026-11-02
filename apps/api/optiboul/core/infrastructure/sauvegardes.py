"""Sauvegardes : pg_dump, chiffrement AES-GCM, dépôt S3 (US-142, ADR-14)."""

from __future__ import annotations

import base64
import os
import struct
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING
from typing import BinaryIO

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db import connection
from django.db import transaction
from django.utils import timezone

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut

from .models import Sauvegarde

if TYPE_CHECKING:
    from datetime import datetime

# Format du fichier chiffré : en-tête, puis des blocs [longueur][nonce][chiffré].
# Chaque bloc est authentifié avec son numéro : ni réordonnable ni tronquable.
EN_TETE = b"OPTIBOUL-SAUVEGARDE-1\n"
TAILLE_BLOC = 1024 * 1024
_NONCE = 12


class CleAbsente(Exception):  # noqa: N818
    """Configuration de la copie cloud incomplète (clé ou compartiment)."""


def cle_de_chiffrement() -> bytes:
    """Clé AES-256 en base64 (OPTIBOUL_CLE_SAUVEGARDE), conservée hors du serveur."""
    brute = settings.OPTIBOUL_CLE_SAUVEGARDE
    if not brute:
        message = "OPTIBOUL_CLE_SAUVEGARDE n'est pas configurée."
        raise CleAbsente(message)
    cle = base64.urlsafe_b64decode(brute)
    if len(cle) != 32:  # noqa: PLR2004
        message = "OPTIBOUL_CLE_SAUVEGARDE doit contenir 32 octets en base64."
        raise CleAbsente(message)
    return cle


def _donnees_associees(numero: int, *, dernier: bool) -> bytes:
    return struct.pack(">Q?", numero, dernier)


def chiffrer(source: BinaryIO, cible: BinaryIO, cle: bytes) -> None:
    aead = AESGCM(cle)
    cible.write(EN_TETE)
    numero = 0
    bloc = source.read(TAILLE_BLOC)
    while True:
        suivant = source.read(TAILLE_BLOC)
        dernier = not suivant
        nonce = os.urandom(_NONCE)
        chiffre = aead.encrypt(nonce, bloc, _donnees_associees(numero, dernier=dernier))
        cible.write(struct.pack(">I", len(chiffre)) + nonce + chiffre)
        if dernier:
            return
        bloc, numero = suivant, numero + 1


def dechiffrer(source: BinaryIO, cible: BinaryIO, cle: bytes) -> None:
    """Pour la restauration (US-143) : refuse un fichier modifié ou tronqué."""
    aead = AESGCM(cle)
    if source.read(len(EN_TETE)) != EN_TETE:
        message = "Ce fichier n'est pas une sauvegarde OptiBoul."
        raise ValueError(message)
    numero = 0
    entete = source.read(4)
    while entete:
        (longueur,) = struct.unpack(">I", entete)
        nonce = source.read(_NONCE)
        chiffre = source.read(longueur)
        entete = source.read(4)
        dernier = not entete
        cible.write(
            aead.decrypt(nonce, chiffre, _donnees_associees(numero, dernier=dernier)),
        )
        numero += 1


class PgDump:
    """Copie complète de la base au format personnalisé de pg_dump (restaurable)."""

    def exporter(self, chemin: Path) -> int:
        reglages = connection.settings_dict
        chemin.parent.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, "PGPASSWORD": str(reglages.get("PASSWORD") or "")}
        commande = [
            "pg_dump",
            "--format=custom",
            "--no-owner",
            f"--file={chemin}",
            f"--host={reglages.get('HOST') or 'localhost'}",
            f"--port={reglages.get('PORT') or 5432}",
            f"--username={reglages.get('USER')}",
            str(reglages["NAME"]),
        ]
        subprocess.run(commande, env=env, check=True, capture_output=True, timeout=3600)  # noqa: S603
        return chemin.stat().st_size


class CoffreS3:
    """Copie chiffrée sur S3 (ADR-14) ; la copie en clair reste sur le serveur."""

    def deposer(self, chemin: Path) -> str:
        import boto3  # noqa: PLC0415 : seulement là où la copie cloud tourne

        cle = cle_de_chiffrement()
        compartiment = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
        if not compartiment:
            message = (
                "Aucun compartiment S3 configuré (DJANGO_AWS_STORAGE_BUCKET_NAME)."
            )
            raise CleAbsente(message)
        chiffre = chemin.with_suffix(chemin.suffix + ".chiffre")
        try:
            with chemin.open("rb") as source, chiffre.open("wb") as cible:
                chiffrer(source, cible, cle)
            objet = f"{settings.OPTIBOUL_SAUVEGARDES_PREFIXE_S3}{chiffre.name}"
            s3 = boto3.client(
                "s3",
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
                region_name=getattr(settings, "AWS_S3_REGION_NAME", None),
            )
            s3.upload_file(str(chiffre), compartiment, objet)
        finally:
            chiffre.unlink(missing_ok=True)
        return f"s3://{compartiment}/{objet}"


class DepotSauvegardesDjango:
    def commencer(
        self,
        genre: Genre,
        declencheur: Declencheur,
        source: int | None,
    ) -> int:
        return Sauvegarde.objects.create(
            genre=genre,
            declencheur=declencheur,
            statut=Statut.EN_COURS,
            source_id=source,
        ).pk

    def reussir(self, sauvegarde_id: int, emplacement: str, taille: int) -> None:
        Sauvegarde.objects.filter(pk=sauvegarde_id).update(
            statut=Statut.REUSSIE,
            emplacement=emplacement,
            taille=taille,
            fin=timezone.now(),
        )

    def echouer(self, sauvegarde_id: int, erreur: str) -> None:
        Sauvegarde.objects.filter(pk=sauvegarde_id).update(
            statut=Statut.ECHEC,
            erreur=erreur[:2000],
            fin=timezone.now(),
        )

    def fichier(self, sauvegarde_id: int) -> str:
        return Sauvegarde.objects.get(pk=sauvegarde_id).emplacement

    def derniere_reussie(self, genre: Genre) -> datetime | None:
        return (
            Sauvegarde.objects.filter(genre=genre, statut=Statut.REUSSIE)
            .order_by("-fin")
            .values_list("fin", flat=True)
            .first()
        )


depot_sauvegardes = DepotSauvegardesDjango()


def dossier_sauvegardes() -> Path:
    return Path(settings.OPTIBOUL_DOSSIER_SAUVEGARDES)


def demander_sauvegarde(declencheur: Declencheur) -> None:
    """À chaque clôture (caisse, production, semaine), une fois validée."""
    from .tasks import sauvegarder  # noqa: PLC0415 : évite l'import circulaire

    transaction.on_commit(lambda: sauvegarder.delay(str(declencheur)))
