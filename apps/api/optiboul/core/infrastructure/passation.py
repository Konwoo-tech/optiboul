"""Rapport de passation en PDF (WeasyPrint, spécification §4.1) et son envoi."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from optiboul.core.application import passation as cas
from optiboul.core.domain.semaines import bornes
from optiboul.core.domain.semaines import code
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi
from optiboul.notifications.infrastructure.envois import notificateur

from .journal import journaliser
from .models import RapportPassation
from .semaines import depot_semaines


def _nom(utilisateur_id: int | None) -> str:
    if utilisateur_id is None:
        return ""
    utilisateur = get_user_model().objects.filter(pk=utilisateur_id).first()
    return utilisateur.name if utilisateur else ""


def html(passation: cas.Passation) -> str:
    semaine = passation.semaine
    periode = bornes(semaine.annee, semaine.numero)
    suivante = passation.suivante
    return render_to_string(
        "passation/rapport.html",
        {
            "code": code(semaine.numero),
            "du": periode.du,
            "au": periode.au,
            "gerant": _nom(semaine.gerant),
            "production": _nom(semaine.production),
            "destinataire": _nom(suivante.gerant) if suivante else "",
            "code_suivante": code(suivante.numero) if suivante else "",
            "sections": passation.sections,
            "incidents": passation.incidents,
            "edite_le": timezone.localtime(),
        },
    )


def pdf(passation: cas.Passation) -> bytes:
    from weasyprint import HTML  # noqa: PLC0415 : bibliothèque lourde, chargée au besoin

    return HTML(string=html(passation)).write_pdf()


@transaction.atomic
def produire(semaine_id: int) -> RapportPassation:
    """Édite (ou réédite) le rapport et l'envoie au gérant de la semaine suivante."""
    passation = cas.preparer(depot_semaines, semaine_id)
    destinataire = passation.suivante.gerant if passation.suivante else None
    rapport, _ = RapportPassation.objects.get_or_create(
        semaine_id=semaine_id,
        defaults={"destinataire_id": destinataire},
    )
    nom = f"passation-{code(passation.semaine.numero)}-{passation.semaine.annee}.pdf"
    rapport.fichier.save(nom, ContentFile(pdf(passation)), save=False)
    rapport.destinataire_id = destinataire
    rapport.cree_le = timezone.now()
    rapport.save()
    journaliser("semaine.passation", objet_type="semaine", objet_id=semaine_id)
    if destinataire is not None:
        _envoyer(passation, destinataire)
    return rapport


def _envoyer(passation: cas.Passation, destinataire: int) -> None:
    semaine = code(passation.semaine.numero)
    lien = f"/gestion/semaines?passation={passation.semaine.id}"
    notificateur.notifier(
        [destinataire],
        genre="semaine.passation",
        titre=f"Rapport de passation de la semaine {semaine}",
        message="Caisses, dettes, stock bas et incidents de la semaine écoulée.",
        lien=lien,
    )
    utilisateur = get_user_model().objects.get(pk=destinataire)
    file_envoi.mettre_en_file(
        Canal.EMAIL,
        utilisateur.email,
        (
            f"Bonjour {utilisateur.name},\n\n"
            f"Le rapport de passation de la semaine {semaine} est prêt :\n"
            f"{settings.OPTIBOUL_URL_APPLICATION}{lien}\n"
        ),
        sujet=f"OptiBoul · passation de la semaine {semaine}",
    )
