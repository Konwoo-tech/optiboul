"""Connexion au comptoir par nom + code à 4 chiffres (O1, US-010)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.contrib.auth import authenticate
from django.contrib.auth import login
from django.contrib.auth.hashers import check_password
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from optiboul.core.api.contexte import auteur_de
from optiboul.core.infrastructure.journal import journaliser

from . import verrouillage
from .domain.verrouillage import ECHECS_MAX
from .models import User

if TYPE_CHECKING:
    from django.http import HttpRequest

    from optiboul.core.application.journal import Auteur

FORMAT_CODE = re.compile(r"^\d{4}$")
INCONNU, INCORRECT, BLOQUE = "utilisateur_inconnu", "code_incorrect", "compte_bloque"
BACKEND = "django.contrib.auth.backends.ModelBackend"
SESSION_VIA = "optiboul_connexion_via"


# Codes de refus renvoyés à l'application web, avec leur message et leur statut HTTP.
REFUS: dict[str, tuple[str, int]] = {
    "utilisateur_inconnu": ("Utilisateur inconnu.", 400),
    "code_incorrect": ("Code incorrect.", 400),
    "compte_bloque": ("Trop d'échecs : compte bloqué 15 minutes.", 403),
    "code_interdit_a_distance": (
        "À distance, connectez-vous par e-mail ou Google.",
        403,
    ),
    "poste_non_reconnu": ("Ce poste n'est pas un poste de confiance.", 403),
    "identifiants_incorrects": ("E-mail ou mot de passe incorrect.", 400),
    "aucune_identification": ("Identifiez-vous d'abord.", 409),
    "aucun_code_envoye": ("Demandez d'abord un code.", 409),
    "trop_d_essais": ("Trop d'essais : demandez un nouveau code.", 400),
    "code_expire": ("Ce code a expiré : demandez-en un nouveau.", 400),
    "renvoi_trop_tot": ("Patientez avant de renvoyer un code.", 429),
    "telephone_absent": ("Aucun numéro enregistré : utilisez un code de secours.", 400),
    "google_invalide": ("Connexion Google refusée : réessayez.", 400),
    "google_indisponible": ("Connexion Google indisponible pour le moment.", 503),
    "compte_inconnu": ("Compte Google non autorisé.", 403),
}


class RefusConnexion(Exception):  # noqa: N818
    """Connexion refusée : code métier, détail et statut pour l'écran (RFC 9457)."""

    def __init__(self, code: str, **autres: object) -> None:
        self.detail, self.statut = REFUS[code]
        super().__init__(self.detail)
        self.code = code
        self.autres = autres


@dataclass(frozen=True)
class Identifie:
    utilisateur: User
    via: str  # « code », « e-mail », « Google »
    verification: str = ""  # canal du second facteur : sms, whatsapp, totp, secours


def definir_code(utilisateur: User, code: str) -> None:
    if not FORMAT_CODE.match(code):
        message = "Le code compte exactement 4 chiffres."
        raise ValueError(message)
    utilisateur.code_pin = make_password(code)
    utilisateur.save(update_fields=["code_pin"])


def utilisateurs_du_poste():
    """Personnes actives qui ont un code : les noms à toucher au comptoir."""
    return User.objects.filter(is_active=True).exclude(code_pin="").order_by("name")


def verifier_code(utilisateur_id: int, code: str, auteur: Auteur) -> Identifie:
    utilisateur = User.objects.filter(pk=utilisateur_id, is_active=True).first()
    if utilisateur is None or not utilisateur.code_pin:
        raise RefusConnexion(INCONNU)
    if verrouillage.est_bloque(utilisateur):
        raise _bloque(utilisateur)
    if not FORMAT_CODE.match(code) or not check_password(code, utilisateur.code_pin):
        if verrouillage.enregistrer_echec(utilisateur, "code", auteur):
            raise _bloque(utilisateur)
        restants = ECHECS_MAX - utilisateur.echecs_connexion
        raise RefusConnexion(INCORRECT, essaisRestants=restants)
    verrouillage.enregistrer_reussite(utilisateur)
    return Identifie(utilisateur, "code")


def verifier_mot_de_passe(
    request: HttpRequest,
    email: str,
    mot_de_passe: str,
    auteur: Auteur,
) -> Identifie:
    """E-mail + mot de passe (autre appareil, accès distant) ; même verrouillage."""
    compte = User.objects.filter(email__iexact=email.strip(), is_active=True).first()
    if compte is not None and verrouillage.est_bloque(compte):
        raise _bloque(compte)
    utilisateur = authenticate(request, username=email.strip(), password=mot_de_passe)
    if utilisateur is None:
        if compte is not None and verrouillage.enregistrer_echec(
            compte,
            "mot_de_passe",
            auteur,
        ):
            raise _bloque(compte)
        raise RefusConnexion("identifiants_incorrects")
    verrouillage.enregistrer_reussite(utilisateur)
    return Identifie(utilisateur, "e-mail")


def _bloque(utilisateur: User) -> RefusConnexion:
    return RefusConnexion(
        BLOQUE,
        jusqua=utilisateur.bloque_jusqua.isoformat()
        if utilisateur.bloque_jusqua
        else None,
    )


def ouvrir_session(request: HttpRequest, identifie: Identifie) -> None:
    login(request, identifie.utilisateur, backend=BACKEND)
    request.session[SESSION_VIA] = identifie.via
    request.session["optiboul_derniere_activite"] = timezone.now().isoformat()
    journaliser(
        "connexion.reussie",
        auteur=auteur_de(request),
        objet_type="utilisateur",
        objet_id=identifie.utilisateur.pk,
        apres={"methode": identifie.via, "verification": identifie.verification},
    )
