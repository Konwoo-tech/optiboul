"""Consultation du journal (US-024) : filtres auteur, type, période ; lecture seule."""

from __future__ import annotations

from datetime import datetime
from datetime import time
from typing import TYPE_CHECKING

from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_view
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.mixins import ListModelMixin
from rest_framework.pagination import CursorPagination
from rest_framework.viewsets import GenericViewSet

from optiboul.core.infrastructure.models import LigneJournal

from .permissions import DIRECTION
from .permissions import ProfilParmi

if TYPE_CHECKING:
    from django.db.models import QuerySet


class LigneJournalSerializer(serializers.ModelSerializer[LigneJournal]):
    class Meta:
        model = LigneJournal
        fields = [
            "id",
            "horodatage",
            "acteur",
            "acteur_nom",
            "profil",
            "poste_id",
            "poste_nom",
            "entree",
            "action",
            "objet_type",
            "objet_id",
            "avant",
            "apres",
        ]
        read_only_fields = fields


class PaginationJournal(CursorPagination):
    ordering = ("-horodatage", "-id")
    page_size = 50


def _borne(valeur: str | None, nom: str, *, fin: bool) -> datetime | None:
    if not valeur:
        return None
    jour = parse_date(valeur)
    if jour is None:
        raise ValidationError({nom: "Date attendue au format AAAA-MM-JJ."})
    return timezone.make_aware(datetime.combine(jour, time.max if fin else time.min))


@extend_schema_view(
    list=extend_schema(
        parameters=[
            OpenApiParameter(
                "auteur",
                OpenApiTypes.INT,
                description="Identifiant de l'acteur",
            ),
            OpenApiParameter(
                "type",
                OpenApiTypes.STR,
                description="Type d'objet (caisse…) ou préfixe d'action (connexion…)",
            ),
            OpenApiParameter(
                "du",
                OpenApiTypes.DATE,
                description="Premier jour inclus",
            ),
            OpenApiParameter(
                "au",
                OpenApiTypes.DATE,
                description="Dernier jour inclus",
            ),
        ],
    ),
)
class JournalViewSet(ListModelMixin, GenericViewSet):
    """Journal non modifiable : aucune route d'écriture, la base refuse UPDATE."""

    serializer_class = LigneJournalSerializer
    pagination_class = PaginationJournal
    permission_classes = [ProfilParmi(*DIRECTION, "administrateur")]
    queryset = LigneJournal.objects.all()

    def get_queryset(self) -> QuerySet[LigneJournal]:
        lignes = super().get_queryset()
        parametres = self.request.query_params
        if auteur := parametres.get("auteur"):
            if not auteur.isdigit():
                raise ValidationError({"auteur": "Identifiant numérique attendu."})
            lignes = lignes.filter(acteur_id=int(auteur))
        if genre := parametres.get("type"):
            lignes = lignes.filter(objet_type=genre) | lignes.filter(
                action__startswith=f"{genre}.",
            )
        if du := _borne(parametres.get("du"), "du", fin=False):
            lignes = lignes.filter(horodatage__gte=du)
        if au := _borne(parametres.get("au"), "au", fin=True):
            lignes = lignes.filter(horodatage__lte=au)
        return lignes
