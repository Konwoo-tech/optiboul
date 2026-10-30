"""Relevé de compte d'un client (US-064, CdC §5.4) : écran, PDF ou WhatsApp."""

from __future__ import annotations

from datetime import datetime
from datetime import time
from datetime import timedelta
from typing import TYPE_CHECKING

from django.db.models import F
from django.db.models import Sum
from django.template.loader import render_to_string
from django.utils import timezone

from optiboul.clients.domain.clients import Releve
from optiboul.clients.domain.clients import construire_releve
from optiboul.clients.domain.clients import texte_releve
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.templatetags.optiboul import fcfa
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi

from .models import MouvementCompte

if TYPE_CHECKING:
    from datetime import date

    from optiboul.core.application.journal import Auteur

    from .models import Client


def _debut_de(jour: date) -> datetime:
    return timezone.make_aware(datetime.combine(jour, time.min))


def releve_de(client: Client, du: date, au: date) -> Releve:
    debut, fin = _debut_de(du), _debut_de(au + timedelta(days=1))
    mouvements = MouvementCompte.objects.filter(client=client)
    anterieur = (
        mouvements.filter(cree_le__lt=debut).aggregate(
            solde=Sum(F("sens") * F("montant")),
        )["solde"]
        or 0
    )
    periode = mouvements.filter(cree_le__gte=debut, cree_le__lt=fin).order_by(
        "cree_le",
        "id",
    )
    return construire_releve(
        anterieur,
        [
            (timezone.localdate(m.cree_le), m.source_type, m.sens, m.montant)
            for m in periode
        ],
    )


def pdf(client: Client, releve: Releve, du: date, au: date) -> bytes:
    from weasyprint import HTML  # noqa: PLC0415 : bibliothèque lourde, chargée au besoin

    html = render_to_string(
        "clients/releve.html",
        {"client": client, "releve": releve, "du": du, "au": au},
    )
    return HTML(string=html).write_pdf()


def envoyer(client: Client, releve: Releve, du: date, au: date, auteur: Auteur) -> int:
    """Le relevé part par WhatsApp, par la file d'envoi (O15)."""
    message = file_envoi.mettre_en_file(
        Canal.WHATSAPP,
        client.telephone,
        texte_releve(client.nom, du, au, releve, fcfa),
        objet_type="client",
        objet_id=client.pk,
    )
    journaliser(
        "clients.releve_envoye",
        auteur=auteur,
        objet_type="client",
        objet_id=client.pk,
        apres={"du": du.isoformat(), "au": au.isoformat(), "message": message},
    )
    return message
