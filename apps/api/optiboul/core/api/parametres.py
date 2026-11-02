"""Paramètres métier (US-023) : le propriétaire modifie, l'administrateur consulte."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from optiboul.core.application import parametres as cas
from optiboul.core.domain.parametres import PAR_CLE
from optiboul.core.domain.parametres import ValeurInvalide
from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.parametres import depot_parametres

from .contexte import auteur_de
from .permissions import ProfilParmi

if TYPE_CHECKING:
    from rest_framework.request import Request


class ParametreSerializer(serializers.Serializer):
    cle = serializers.CharField()
    libelle = serializers.CharField()
    genre = serializers.CharField()
    unite = serializers.CharField()
    usage = serializers.CharField()
    valeur = serializers.JSONField()
    defaut = serializers.JSONField()
    choix = serializers.ListField(child=serializers.IntegerField())
    minimum = serializers.IntegerField(allow_null=True)
    maximum = serializers.IntegerField(allow_null=True)
    modifie_le = serializers.DateTimeField(allow_null=True)
    modifie_par = serializers.CharField()


class ModificationSerializer(serializers.Serializer):
    valeur = serializers.JSONField()


class ValeurSerializer(serializers.Serializer):
    valeur = serializers.JSONField()
    auteur = serializers.CharField()
    le = serializers.DateTimeField()


def _projeter(etat: cas.EtatParametre) -> dict:
    item = etat.definition
    return {
        "cle": item.cle,
        "libelle": item.libelle,
        "genre": item.genre,
        "unite": item.unite,
        "usage": item.usage,
        "valeur": etat.valeur,
        "defaut": item.defaut,
        "choix": list(item.choix),
        "minimum": item.minimum,
        "maximum": item.maximum,
        "modifie_le": etat.derniere.le if etat.derniere else None,
        "modifie_par": etat.derniere.auteur if etat.derniere else "",
    }


def _cle_connue(cle: str) -> str:
    if cle not in PAR_CLE:
        message = "Paramètre inconnu."
        raise NotFound(message)
    return cle


class ParametresViewSet(ViewSet):
    lookup_field = "cle"
    lookup_value_regex = r"[a-z_]+"

    def get_permissions(self):
        if self.action == "update":
            return [ProfilParmi("proprietaire")()]
        return [ProfilParmi("proprietaire", "administrateur")()]

    @extend_schema(responses=ParametreSerializer(many=True))
    def list(self, request: Request) -> Response:
        return Response([_projeter(etat) for etat in cas.etats(depot_parametres)])

    @extend_schema(request=ModificationSerializer, responses=ParametreSerializer)
    def update(self, request: Request, cle: str) -> Response:
        _cle_connue(cle)
        corps = ModificationSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                cas.modifier(
                    depot_parametres,
                    journal,
                    cle=cle,
                    valeur=corps.validated_data["valeur"],
                    auteur=auteur_de(request),
                )
        except ValeurInvalide as erreur:
            raise ValidationError({"valeur": str(erreur)}) from erreur
        etat = next(e for e in cas.etats(depot_parametres) if e.definition.cle == cle)
        return Response(_projeter(etat))

    @extend_schema(responses=ValeurSerializer(many=True))
    @action(detail=True)
    def historique(self, request: Request, cle: str) -> Response:
        _cle_connue(cle)
        valeurs = depot_parametres.historique(cle)
        return Response(ValeurSerializer(valeurs, many=True).data)
