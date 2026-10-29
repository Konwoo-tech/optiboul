"""Double authentification par SMS ou WhatsApp (US-011) ; la session attend le code."""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import TYPE_CHECKING
from typing import Any

from django.contrib.auth.hashers import check_password
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from optiboul.core.api.contexte import entree_de
from optiboul.core.application.journal import Entree
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.domain.envois import masquer_telephone
from optiboul.notifications.infrastructure.envois import file_envoi

from . import connexion
from .connexion import Identifie
from .connexion import RefusConnexion
from .domain.double_auth import ESSAIS_CODE
from .domain.double_auth import LONGUEUR_CODE
from .domain.double_auth import VALIDITE_CODE
from .domain.double_auth import VALIDITE_IDENTIFICATION
from .domain.double_auth import double_auth_requise
from .domain.double_auth import renvoi_dans
from .models import CodeVerification
from .models import User

if TYPE_CHECKING:
    from django.http import HttpRequest

SESSION = "optiboul_identification"


def requise(request: HttpRequest, identifie: Identifie) -> bool:
    utilisateur = identifie.utilisateur
    return double_auth_requise(
        via=identifie.via,
        profil=utilisateur.profil,
        distante=entree_de(request) is Entree.DISTANTE,
        derniere=utilisateur.derniere_double_auth,
        maintenant=timezone.now(),
    )


def demarrer(request: HttpRequest, identifie: Identifie) -> dict[str, Any]:
    """Identifiée mais pas encore connectée : la session attend le second facteur."""
    utilisateur = identifie.utilisateur
    request.session[SESSION] = {
        "utilisateur": utilisateur.pk,
        "via": identifie.via,
        "expire": (timezone.now() + VALIDITE_IDENTIFICATION).isoformat(),
    }
    return {
        "deuxFacteurs": True,
        "utilisateur": {
            "id": utilisateur.pk,
            "nom": utilisateur.name,
            "profil": utilisateur.profil,
            "email": utilisateur.email,
        },
        "telephoneMasque": masquer_telephone(utilisateur.telephone)
        if utilisateur.telephone
        else "",
        "canal": utilisateur.canal_verification,
        "via": identifie.via,
        "applicationAuthentification": _a_un_totp(utilisateur),
    }


def _a_un_totp(utilisateur: User) -> bool:
    from allauth.mfa.models import Authenticator  # noqa: PLC0415

    return Authenticator.objects.filter(
        user=utilisateur,
        type=Authenticator.Type.TOTP,
    ).exists()


def en_attente(request: HttpRequest) -> Identifie:
    attente = request.session.get(SESSION)
    if not attente or datetime.fromisoformat(attente["expire"]) < timezone.now():
        request.session.pop(SESSION, None)
        raise RefusConnexion("aucune_identification")
    utilisateur = User.objects.filter(pk=attente["utilisateur"], is_active=True).first()
    if utilisateur is None:
        raise RefusConnexion("aucune_identification")
    return Identifie(utilisateur, attente["via"])


def annuler(request: HttpRequest) -> None:
    request.session.pop(SESSION, None)


def _dernier_code(utilisateur: User) -> CodeVerification | None:
    return utilisateur.codes_verification.filter(utilise=False).first()


def envoyer_code(request: HttpRequest, canal: str) -> dict[str, Any]:
    """Code à 6 chiffres par la file d'envoi ; renvoi après 30 s, autre canal permis."""
    identifie = en_attente(request)
    utilisateur = identifie.utilisateur
    if not utilisateur.telephone:
        raise RefusConnexion("telephone_absent")
    canal = Canal.WHATSAPP if canal == Canal.WHATSAPP else Canal.SMS
    maintenant = timezone.now()
    precedent = _dernier_code(utilisateur)
    if precedent and precedent.canal == canal:
        attente = renvoi_dans(precedent.cree_le, maintenant)
        if attente:
            raise RefusConnexion("renvoi_trop_tot", renvoiDans=attente)
    utilisateur.codes_verification.filter(utilise=False).update(utilise=True)
    code = "".join(secrets.choice("0123456789") for _ in range(LONGUEUR_CODE))
    CodeVerification.objects.create(
        utilisateur=utilisateur,
        code=make_password(code),
        canal=canal,
        cree_le=maintenant,
        expire_le=maintenant + VALIDITE_CODE,
    )
    file_envoi.mettre_en_file(
        canal,
        utilisateur.telephone,
        f"OptiBoul : votre code de connexion est {code}. Il expire dans 5 minutes.",
    )
    heure = timezone.localtime(maintenant)
    return {
        "heure": f"{heure:%H:%M}",
        "canal": canal,
        "telephoneMasque": masquer_telephone(utilisateur.telephone),
        "renvoiDans": renvoi_dans(maintenant, maintenant),
    }


def verifier(request: HttpRequest, code: str) -> Identifie:
    """3 essais par code ; au-delà, ou après 5 minutes, il faut un nouveau code."""
    identifie = en_attente(request)
    envoye = _dernier_code(identifie.utilisateur)
    if envoye is None:
        raise RefusConnexion("aucun_code_envoye")
    if envoye.expire_le < timezone.now():
        raise RefusConnexion("code_expire")
    if envoye.essais >= ESSAIS_CODE:
        raise RefusConnexion("trop_d_essais", essaisRestants=0)
    if not check_password(code, envoye.code):
        envoye.essais += 1
        envoye.save(update_fields=["essais"])
        restants = ESSAIS_CODE - envoye.essais
        if restants == 0:
            raise RefusConnexion("trop_d_essais", essaisRestants=0)
        raise RefusConnexion(connexion.INCORRECT, essaisRestants=restants)
    envoye.utilise = True
    envoye.save(update_fields=["utilise"])
    return Identifie(identifie.utilisateur, identifie.via, verification=envoye.canal)


def terminer(request: HttpRequest, identifie: Identifie) -> None:
    """Second facteur validé (ou non requis) : la session s'ouvre."""
    annuler(request)
    if identifie.verification:
        utilisateur = identifie.utilisateur
        utilisateur.derniere_double_auth = timezone.now()
        utilisateur.save(update_fields=["derniere_double_auth"])
    connexion.ouvrir_session(request, identifie)
