"""Cas d'usage des sauvegardes (US-142) : locale, copie cloud chiffrée, alerte."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import copie_cloud_en_retard
from optiboul.core.domain.sauvegardes import nom_fichier

if TYPE_CHECKING:
    from datetime import datetime
    from pathlib import Path

    from optiboul.notifications.application.ports import Notificateur

ALERTE_CLOUD = "sauvegarde.cloud_en_retard"


class Exportateur(Protocol):
    def exporter(self, chemin: Path) -> int:
        """Écrit une copie complète de la base ; renvoie sa taille en octets."""
        ...


class Coffre(Protocol):
    def deposer(self, chemin: Path) -> str:
        """Chiffre et dépose la copie hors du serveur ; renvoie son emplacement."""
        ...


class DepotSauvegardes(Protocol):
    def commencer(
        self,
        genre: Genre,
        declencheur: Declencheur,
        source: int | None,
    ) -> int: ...

    def reussir(self, sauvegarde_id: int, emplacement: str, taille: int) -> None: ...

    def echouer(self, sauvegarde_id: int, erreur: str) -> None: ...

    def fichier(self, sauvegarde_id: int) -> str: ...

    def derniere_reussie(self, genre: Genre) -> datetime | None: ...


def sauvegarder_localement(  # noqa: PLR0913
    depot: DepotSauvegardes,
    exportateur: Exportateur,
    *,
    dossier: Path,
    declencheur: Declencheur,
    maintenant: datetime,
    sauvegarde_id: int | None = None,
) -> int:
    """Copie locale ; un échec est enregistré, puis l'erreur est relancée.

    `sauvegarde_id` : ligne déjà inscrite par l'API pour être suivie (#359).
    """
    if sauvegarde_id is None:
        sauvegarde_id = depot.commencer(Genre.LOCALE, declencheur, None)
    chemin = dossier / nom_fichier(maintenant, declencheur)
    try:
        taille = exportateur.exporter(chemin)
    except Exception as erreur:
        depot.echouer(sauvegarde_id, str(erreur))
        raise
    depot.reussir(sauvegarde_id, str(chemin), taille)
    return sauvegarde_id


def copier_dans_le_cloud(
    depot: DepotSauvegardes,
    coffre: Coffre,
    *,
    source: int,
    chemin: Path,
    sauvegarde_id: int | None = None,
) -> int:
    if sauvegarde_id is None:
        sauvegarde_id = depot.commencer(Genre.CLOUD, Declencheur.PLANIFIEE, source)
    try:
        emplacement = coffre.deposer(chemin)
    except Exception as erreur:
        depot.echouer(sauvegarde_id, str(erreur))
        raise
    depot.reussir(sauvegarde_id, emplacement, chemin.stat().st_size)
    return sauvegarde_id


def verifier_copie_cloud(
    depot: DepotSauvegardes,
    notificateur: Notificateur,
    *,
    maintenant: datetime,
    seuil_heures: int,
    deja_alerte: bool,
) -> bool:
    """Alerte l'administrateur et le propriétaire si la copie cloud est en retard."""
    derniere = depot.derniere_reussie(Genre.CLOUD)
    if not copie_cloud_en_retard(derniere, maintenant, seuil_heures) or deja_alerte:
        return False
    depuis = f"depuis le {derniere:%d/%m/%Y à %H:%M}" if derniere else "jamais réussie"
    notificateur.notifier_profils(
        ["administrateur", "proprietaire"],
        genre=ALERTE_CLOUD,
        titre=f"Aucune copie cloud depuis plus de {seuil_heures} h",
        message=f"Dernière copie cloud {depuis}. Vérifiez la connexion internet.",
        lien="/gestion/sauvegardes",
    )
    return True
