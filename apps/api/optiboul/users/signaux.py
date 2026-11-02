"""Échecs de mot de passe (allauth, admin) tracés dans le journal (US-155)."""

from __future__ import annotations

from typing import Any

from django.contrib.auth.signals import user_login_failed
from django.dispatch import receiver

from optiboul.core.api.contexte import entree_de
from optiboul.core.application.journal import Auteur
from optiboul.core.application.journal import Entree
from optiboul.core.infrastructure.journal import journaliser


@receiver(user_login_failed)
def tracer_echec(
    sender: Any,
    credentials: dict[str, Any],
    request: Any = None,
    **kwargs,
):
    compte = str(credentials.get("email") or credentials.get("username") or "")
    auteur = Auteur(
        utilisateur_id=None,
        nom=compte,
        entree=entree_de(request) if request is not None else Entree.LOCALE,
        adresse_ip=request.META.get("REMOTE_ADDR") if request is not None else None,
    )
    journaliser(
        "connexion.echec",
        auteur=auteur,
        objet_type="utilisateur",
        apres={"methode": "mot_de_passe", "compte": compte},
    )
