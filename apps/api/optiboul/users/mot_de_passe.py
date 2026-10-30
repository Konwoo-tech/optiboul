"""Mot de passe oublié (US-015, CdC §4.1) : un lien à durée limitée, à usage unique."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.core import signing

from optiboul.core.infrastructure.journal import journaliser
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi

from .models import User

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur

DUREE_DU_LIEN = timedelta(hours=1)
SEL = "optiboul.mot_de_passe"


def _empreinte(utilisateur: User) -> str:
    """Change avec le mot de passe : un lien utilisé ne resert pas."""
    return utilisateur.password[-16:]


def jeton_pour(utilisateur: User) -> str:
    return signing.dumps(
        {"id": utilisateur.pk, "empreinte": _empreinte(utilisateur)},
        salt=SEL,
        compress=True,
    )


def demander(email: str, auteur: Auteur) -> None:
    """Toujours la même réponse, que l'adresse existe ou non (pas d'énumération)."""
    utilisateur = User.objects.filter(
        email__iexact=email.strip(),
        is_active=True,
    ).first()
    journaliser(
        "mot_de_passe.demande",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk if utilisateur else "",
        apres={"compte_trouve": utilisateur is not None},
    )
    if utilisateur is None:
        return
    lien = (
        f"{settings.OPTIBOUL_URL_APPLICATION}/connexion/nouveau-mot-de-passe"
        f"?jeton={jeton_pour(utilisateur)}"
    )
    file_envoi.mettre_en_file(
        Canal.EMAIL,
        utilisateur.email,
        f"Bonjour {utilisateur.name},\n\n"
        f"Pour choisir un nouveau mot de passe OptiBoul, ouvrez ce lien dans "
        f"l'heure :\n{lien}\n\nSi vous n'avez rien demandé, ignorez ce message.",
        "OptiBoul : nouveau mot de passe",
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
    )


def reinitialiser(jeton: str, mot_de_passe: str, auteur: Auteur) -> User | None:
    """Le nouveau mot de passe, si le lien est valide, récent et pas encore utilisé."""
    try:
        contenu = signing.loads(
            jeton,
            salt=SEL,
            max_age=DUREE_DU_LIEN,
        )
    except signing.BadSignature:
        return None
    utilisateur = User.objects.filter(pk=contenu.get("id"), is_active=True).first()
    if utilisateur is None or contenu.get("empreinte") != _empreinte(utilisateur):
        return None
    utilisateur.set_password(mot_de_passe)
    utilisateur.save(update_fields=["password"])
    journaliser(
        "mot_de_passe.reinitialise",
        auteur=auteur,
        objet_type="utilisateur",
        objet_id=utilisateur.pk,
    )
    return utilisateur
