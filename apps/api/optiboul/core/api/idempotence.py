"""En-tête `Idempotency-Key` des POST d'argent (spécification §4.2, §6.1).

Un double clic, une reprise réseau ou le rejeu de la file d'envoi du navigateur
renvoie la première réponse au lieu de refaire l'opération. Seules les réponses
réussies sont gardées : après un refus (plafond…), la même clé peut resservir.
"""

from __future__ import annotations

from functools import wraps
from typing import TYPE_CHECKING
from typing import Any

from django.db import IntegrityError
from django.db import transaction
from drf_spectacular.utils import OpenApiParameter
from rest_framework.response import Response

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.models import RequeteIdempotente

from .erreurs import probleme

if TYPE_CHECKING:
    from collections.abc import Callable

    from rest_framework.request import Request

EN_TETE = "Idempotency-Key"
LONGUEUR_MAX = 100

PARAMETRE = OpenApiParameter(
    EN_TETE,
    str,
    location=OpenApiParameter.HEADER,
    required=True,
    description="Clé unique de l'opération, générée par l'application web.",
)


def idempotent(vue: Callable[..., Response]) -> Callable[..., Response]:
    @wraps(vue)
    def enveloppe(self: Any, request: Request, *args: Any, **kwargs: Any) -> Response:
        cle = request.headers.get(EN_TETE, "").strip()
        if not cle or len(cle) > LONGUEUR_MAX:
            message = f"En-tête {EN_TETE} obligatoire (100 caractères au plus)."
            return probleme(RefusMetier("cle_idempotence_absente", message))
        utilisateur = request.user.pk
        assert utilisateur is not None  # vue réservée aux personnes connectées
        with transaction.atomic():
            try:
                # Une seconde requête de même clé attend ici la fin de la première.
                with transaction.atomic():
                    trace = RequeteIdempotente.objects.create(
                        utilisateur_id=utilisateur,
                        cle=cle,
                        chemin=request.path,
                    )
            except IntegrityError:
                return _rejouer(request, cle)
            reponse = vue(self, request, *args, **kwargs)
            if 200 <= reponse.status_code < 300:  # noqa: PLR2004
                trace.statut = reponse.status_code
                trace.reponse = reponse.data
                trace.save(update_fields=["statut", "reponse"])
            else:
                trace.delete()
        return reponse

    return enveloppe


def _rejouer(request: Request, cle: str) -> Response:
    trace = RequeteIdempotente.objects.get(utilisateur_id=request.user.pk, cle=cle)
    if trace.chemin != request.path:
        message = "Cette clé a déjà servi pour une autre opération."
        return probleme(RefusMetier("cle_idempotence_reutilisee", message))
    return Response(
        trace.reponse,
        status=trace.statut,
        headers={"Idempotent-Replayed": "true"},
    )
