"""Connexion avec Google (US-013, CdC §4.1) : seuls les Gmail enregistrés passent.

L'application web obtient un jeton d'identité Google (Google Identity Services) ;
l'API le fait vérifier par Google, puis cherche le compte dont c'est le Gmail. La
double authentification suit toujours (accès depuis un téléphone).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import requests
from django.conf import settings

from optiboul.core.infrastructure.journal import journaliser

from .connexion import Identifie
from .connexion import RefusConnexion
from .models import User

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur

VERIFICATION = "https://oauth2.googleapis.com/tokeninfo"
EMETTEURS = {"accounts.google.com", "https://accounts.google.com"}
DELAI = 5
INVALIDE = "google_invalide"
INDISPONIBLE = "google_indisponible"
INCONNU = "compte_inconnu"
# En local seulement (#306) : « test:<gmail> » remplace le jeton de Google.
PREFIXE_DE_TEST = "test:"


def jetons_de_test_actifs() -> bool:
    return bool(settings.DEBUG and settings.OPTIBOUL_GOOGLE_JETONS_DE_TEST)


def email_verifie(jeton: str) -> str:
    """Le Gmail vérifié porté par le jeton, ou un refus (jeton faux, autre client)."""
    if jetons_de_test_actifs() and jeton.startswith(PREFIXE_DE_TEST):
        email = jeton.removeprefix(PREFIXE_DE_TEST).strip().lower()
        if not email.endswith("@gmail.com"):
            raise RefusConnexion(INVALIDE)
        return email
    client = settings.OPTIBOUL_GOOGLE_CLIENT_ID
    if not client:
        raise RefusConnexion(INDISPONIBLE)
    try:
        reponse = requests.get(VERIFICATION, params={"id_token": jeton}, timeout=DELAI)
    except requests.RequestException:
        raise RefusConnexion(INDISPONIBLE) from None
    if reponse.status_code != 200:  # noqa: PLR2004
        raise RefusConnexion(INVALIDE)
    contenu = reponse.json()
    if (
        contenu.get("aud") != client
        or contenu.get("iss") not in EMETTEURS
        or str(contenu.get("email_verified")).lower() != "true"
        or not str(contenu.get("email", "")).lower().endswith("@gmail.com")
    ):
        raise RefusConnexion(INVALIDE)
    return str(contenu["email"]).lower()


def identifier(jeton: str, auteur: Auteur) -> Identifie:
    email = email_verifie(jeton)
    utilisateur = User.objects.filter(email__iexact=email, is_active=True).first()
    if utilisateur is None:
        journaliser(
            "connexion.google_refusee",
            auteur=auteur,
            objet_type="utilisateur",
            apres={"email": email},
        )
        raise RefusConnexion(INCONNU)
    return Identifie(utilisateur, "Google")
