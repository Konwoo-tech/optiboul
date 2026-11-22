"""Groupes (US-021) : créés et modifiés par l'administrateur."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth.models import Group
from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.mixins import ListModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.users import groupes
from optiboul.users.models import Profil

if TYPE_CHECKING:
    from rest_framework.request import Request


class GroupeSerializer(serializers.ModelSerializer[Group]):
    nom = serializers.CharField(source="name", max_length=150)
    profil = serializers.ChoiceField(
        choices=Profil.choices,
        source="profil_droits.profil",
    )
    description = serializers.CharField(
        source="profil_droits.description",
        allow_blank=True,
        required=False,
        default="",
    )
    membres = serializers.IntegerField(read_only=True)
    protege = serializers.BooleanField(
        source="profil_droits.protege",
        read_only=True,
        help_text="Groupe de départ : il ne se supprime pas.",
    )

    class Meta:
        model = Group
        fields = ["id", "nom", "profil", "description", "membres", "protege"]

    def validate_nom(self, nom: str) -> str:
        autres = Group.objects.filter(name__iexact=nom)
        if self.instance is not None:
            autres = autres.exclude(pk=self.instance.pk)
        if autres.exists():
            message = "Un groupe porte déjà ce nom."
            raise serializers.ValidationError(message)
        return nom


class GroupesViewSet(ListModelMixin, GenericViewSet):
    serializer_class = GroupeSerializer
    permission_classes = [ProfilParmi("administrateur")]
    queryset = (
        Group.objects.filter(profil_droits__isnull=False)
        .select_related("profil_droits")
        .annotate(membres=Count("user"))
        .order_by("name")
    )

    @extend_schema(request=GroupeSerializer, responses={201: GroupeSerializer})
    def create(self, request: Request) -> Response:
        corps = GroupeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        groupe = groupes.creer_groupe(
            donnees["name"],
            donnees["profil_droits"]["profil"],
            donnees["profil_droits"].get("description", ""),
            auteur_de(request),
        )
        return Response(
            GroupeSerializer(self.get_queryset().get(pk=groupe.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=GroupeSerializer, responses=GroupeSerializer)
    def partial_update(self, request: Request, pk: str) -> Response:
        groupe = self.get_object()
        corps = GroupeSerializer(groupe, data=request.data, partial=True)
        corps.is_valid(raise_exception=True)
        donnees = corps.validated_data
        champs = {
            "nom": donnees.get("name"),
            **{
                cle: valeur
                for cle, valeur in donnees.get("profil_droits", {}).items()
                if valeur is not None
            },
        }
        groupes.modifier_groupe(
            groupe,
            auteur_de(request),
            **{cle: v for cle, v in champs.items() if v is not None},
        )
        return Response(GroupeSerializer(self.get_queryset().get(pk=groupe.pk)).data)

    @extend_schema(
        responses={204: None, 404: ProblemeSerializer, 409: ProblemeSerializer},
    )
    def destroy(self, request: Request, pk: str) -> Response:
        """Supprime un groupe vide créé par l'administrateur (#303)."""
        try:
            groupes.supprimer_groupe(self.get_object(), auteur_de(request))
        except RefusMetier as refus:
            return probleme(refus)
        return Response(status=status.HTTP_204_NO_CONTENT)
