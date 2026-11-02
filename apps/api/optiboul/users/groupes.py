"""Groupes et profils de droits (CdC §3.2, US-021) : effet immédiat, tracé."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth.models import Group
from django.db import transaction

from optiboul.core.infrastructure.journal import journaliser

from .models import ProfilGroupe

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur

    from .models import User


def _appartenance(utilisateur: User) -> dict[str, str | None]:
    groupe = utilisateur.groups.select_related("profil_droits").first()
    return {
        "groupe": groupe.name if groupe else None,
        "profil": utilisateur.profil,
    }


@transaction.atomic
def creer_groupe(nom: str, profil: str, description: str, auteur: Auteur) -> Group:
    groupe = Group.objects.create(name=nom)
    ProfilGroupe.objects.create(groupe=groupe, profil=profil, description=description)
    journaliser(
        "groupe.cree",
        auteur=auteur,
        objet_type="groupe",
        objet_id=groupe.pk,
        apres={"nom": nom, "profil": profil, "description": description},
    )
    return groupe


@transaction.atomic
def modifier_groupe(groupe: Group, auteur: Auteur, **champs: str) -> Group:
    droits = groupe.profil_droits
    avant = {
        "nom": groupe.name,
        "profil": droits.profil,
        "description": droits.description,
    }
    groupe.name = champs.get("nom", groupe.name)
    groupe.save(update_fields=["name"])
    droits.profil = champs.get("profil", droits.profil)
    droits.description = champs.get("description", droits.description)
    droits.save(update_fields=["profil", "description"])
    apres = {
        "nom": groupe.name,
        "profil": droits.profil,
        "description": droits.description,
    }
    if apres != avant:
        journaliser(
            "groupe.modifie",
            auteur=auteur,
            objet_type="groupe",
            objet_id=groupe.pk,
            avant=avant,
            apres=apres,
        )
    return groupe


@transaction.atomic
def changer_de_groupe(utilisateur: User, groupe: Group, auteur: Auteur) -> None:
    """Un utilisateur appartient à un seul groupe ; ses droits changent aussitôt."""
    avant = _appartenance(utilisateur)
    utilisateur.groups.set([groupe])
    apres = _appartenance(utilisateur)
    if apres != avant:
        journaliser(
            "utilisateur.groupe_change",
            auteur=auteur,
            objet_type="utilisateur",
            objet_id=utilisateur.pk,
            avant=avant,
            apres=apres,
        )
