"""Ports de notification utilisés par les cas d'usage des autres applications."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Protocol

if TYPE_CHECKING:
    from collections.abc import Iterable

    from optiboul.notifications.domain.envois import Canal


class Notificateur(Protocol):
    def notifier_profils(
        self,
        profils: Iterable[str],
        *,
        genre: str,
        titre: str,
        message: str = "",
        lien: str = "",
    ) -> int:
        """Notifie les personnes actives de ces profils ; renvoie leur nombre."""
        ...

    def notifier(
        self,
        utilisateur_ids: Iterable[int],
        *,
        genre: str,
        titre: str,
        message: str = "",
        lien: str = "",
    ) -> int: ...

    def notifier_type(
        self,
        genre: str,
        *,
        titre: str,
        message: str = "",
        lien: str = "",
    ) -> int:
        """Selon la table de routage (CdC §5.13) : rôles concernés et canaux."""
        ...


class FileEnvoi(Protocol):
    def mettre_en_file(  # noqa: PLR0913
        self,
        canal: Canal,
        destinataire: str,
        contenu: str,
        sujet: str = "",
        *,
        objet_type: str = "",
        objet_id: int | None = None,
    ) -> int:
        """Écrit le message dans la file ; il partira quand le réseau sera là (R22)."""
        ...
