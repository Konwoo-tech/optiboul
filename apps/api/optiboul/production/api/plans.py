"""Plan de production (US-081, CdC §5.5, R4) : calculé, comparé, proposé."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.production.application import plans as cas
from optiboul.production.domain.plan import StatutPlan
from optiboul.production.domain.plan import session_de_production
from optiboul.production.infrastructure.plans import depots
from optiboul.production.infrastructure.plans import nombre_de_sessions
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.infrastructure.commandes import limites

if TYPE_CHECKING:
    from rest_framework.request import Request

LISENT_LE_PLAN = ("production", *DIRECTION)


class SessionProductionSerializer(serializers.Serializer):
    """Sans jour ni créneau : la session dont les commandes sont closes."""

    jour = serializers.DateField(required=False)
    creneau = serializers.ChoiceField(choices=[JOUR, NUIT], required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if ("jour" in attrs) != ("creneau" in attrs):
            message = "Indiquez le jour et le créneau, ou aucun des deux."
            raise serializers.ValidationError(message)
        return attrs

    def session(self) -> Session:
        donnees = self.validated_data
        if "jour" in donnees:
            return Session(donnees["jour"], donnees["creneau"])
        return session_de_production(timezone.now(), limites())


class LignePlanSerializer(serializers.Serializer):
    code = serializers.CharField()
    version_fiche = serializers.IntegerField()
    pains_par_sac = serializers.IntegerField()
    commandes = serializers.IntegerField(help_text="Pains commandés.")
    sacs = serializers.IntegerField()
    prevus = serializers.IntegerField(
        help_text="Pains prévus : sacs fois pains par sac.",
    )
    boules = serializers.IntegerField()
    moyenne_sacs = serializers.DecimalField(
        max_digits=8,
        decimal_places=1,
        allow_null=True,
        help_text="Sacs moyens des dernières sessions du même type.",
    )


class PlanSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.CharField()
    statut = serializers.ChoiceField(
        choices=[s.value for s in StatutPlan],
        allow_null=True,
        help_text="Vide : le plan n'est pas encore proposé.",
    )
    lignes = LignePlanSerializer(many=True)
    sacs = serializers.IntegerField()
    prevus = serializers.IntegerField()
    moyenne_sacs = serializers.DecimalField(
        max_digits=8,
        decimal_places=1,
        allow_null=True,
    )
    ecart = serializers.IntegerField(
        allow_null=True,
        help_text="Écart des sacs à la moyenne, en %.",
    )


def projeter(plan: cas.PlanCalcule) -> dict[str, Any]:
    ecart = None
    if plan.moyenne_sacs:
        ecart = round(
            (Decimal(plan.sacs) - plan.moyenne_sacs) * 100 / plan.moyenne_sacs,
        )
    return {
        "jour": plan.session.jour,
        "creneau": plan.session.creneau,
        "statut": plan.enregistre.statut if plan.enregistre else None,
        "lignes": [
            {
                "code": item.code,
                "version_fiche": item.rendement.version,
                "pains_par_sac": item.rendement.pains_par_sac,
                "commandes": item.commandes,
                "sacs": item.sacs,
                "prevus": item.prevus,
                "boules": item.boules,
                "moyenne_sacs": item.moyenne_sacs,
            }
            for item in plan.lignes
        ],
        "sacs": plan.sacs,
        "prevus": plan.prevus,
        "moyenne_sacs": plan.moyenne_sacs,
        "ecart": ecart,
    }


PARAMETRES_SESSION = [
    OpenApiParameter("jour", str, description="AAAA-MM-JJ, avec le créneau"),
    OpenApiParameter("creneau", str, enum=[JOUR, NUIT]),
]


class ProductionsViewSet(ViewSet):
    def get_permissions(self):
        if self.action == "plan":
            return [ProfilParmi(*LISENT_LE_PLAN)()]
        return [ProfilParmi("production")()]

    @extend_schema(parameters=PARAMETRES_SESSION, responses=PlanSerializer)
    @action(detail=False)
    def plan(self, request: Request) -> Response:
        """Sacs, pains prévus et boules par produit, comparés aux dernières sessions."""
        parametres = SessionProductionSerializer(data=request.query_params)
        parametres.is_valid(raise_exception=True)
        plan = cas.calculer(
            depots,
            session=parametres.session(),
            nombre=nombre_de_sessions(),
        )
        return Response(PlanSerializer(projeter(plan)).data)

    @extend_schema(
        request=SessionProductionSerializer,
        responses={200: PlanSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def proposer(self, request: Request) -> Response:
        """Le responsable de production propose le plan ; le gérant est prévenu."""
        corps = SessionProductionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                plan = cas.proposer(
                    depots,
                    session=corps.session(),
                    nombre=nombre_de_sessions(),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(PlanSerializer(projeter(plan)).data)
