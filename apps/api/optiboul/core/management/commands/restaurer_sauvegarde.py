"""`manage.py restaurer_sauvegarde FICHIER` : essai, puis restauration confirmée."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from typing import Any

from django.core.management.base import BaseCommand
from django.core.management.base import CommandError
from django.utils import timezone

from optiboul.core.application.journal import SYSTEME
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.restauration import RestaurationImpossible
from optiboul.core.infrastructure.restauration import essayer
from optiboul.core.infrastructure.restauration import restaurer
from optiboul.core.infrastructure.sauvegardes import CleAbsente
from optiboul.core.infrastructure.sauvegardes import dossier_sauvegardes

if TYPE_CHECKING:
    from argparse import ArgumentParser

CONFIRMATION = "REMPLACER-LA-BASE"


class Command(BaseCommand):
    help = "Essaie une sauvegarde dans une base jetable, ou la restaure si confirmé."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("fichier", type=Path)
        parser.add_argument(
            "--confirmer",
            default="",
            help=f"« {CONFIRMATION} » pour remplacer la base de travail.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        fichier: Path = options["fichier"]
        if not fichier.is_file():
            message = f"Fichier introuvable : {fichier}"
            raise CommandError(message)
        try:
            rapport = essayer(fichier)
            for table, lignes in rapport.lignes.items():
                self.stdout.write(f"{table} : {lignes} ligne(s)")
            if options["confirmer"] != CONFIRMATION:
                self.stdout.write(
                    self.style.SUCCESS(
                        "Essai réussi, base de travail intacte. Pour restaurer : "
                        f"--confirmer {CONFIRMATION}",
                    ),
                )
                return
            copie = dossier_sauvegardes() / (
                f"avant-restauration-{timezone.now():%Y%m%d-%H%M%S}.dump"
            )
            restaurer(fichier, copie)
        except (RestaurationImpossible, CleAbsente) as erreur:
            raise CommandError(str(erreur)) from erreur
        journaliser(
            "sauvegarde.restauree",
            auteur=SYSTEME,
            objet_type="sauvegarde",
            apres={"fichier": fichier.name, "copie": copie.name},
        )
        self.stdout.write(
            self.style.SUCCESS(f"Base restaurée. Copie de sécurité : {copie}"),
        )
