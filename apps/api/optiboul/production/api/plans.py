"""Plan de production (US-081, US-086, CdC §5.5, R4) : trois sources, proposé."""

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
from optiboul.production.domain.plan import MotifSupplement
from optiboul.production.domain.plan import StatutPlan
from optiboul.production.domain.plan import heure_validation_auto
from optiboul.production.domain.plan import session_de_production
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.plans import depots
from optiboul.production.infrastructure.plans import nombre_de_sessions
from optiboul.production.infrastructure.plans import petrissage
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


class PropositionPlanSerializer(SessionProductionSerializer):
    supplement = serializers.DictField(
        child=serializers.IntegerField(min_value=0),
        required=False,
        help_text="Code du produit → sacs ajoutés par le chef de production.",
    )
    motif = serializers.ChoiceField(
        choices=[m.value for m in MotifSupplement],
        required=False,
        help_text="Obligatoire avec un supplément.",
    )


class LignePlanSerializer(serializers.Serializer):
    code = serializers.CharField()
    version_fiche = serializers.IntegerField()
    pains_par_sac = serializers.IntegerField()
    commandes = serializers.IntegerField(help_text="Pains commandés.")
    habituels = serializers.IntegerField(help_text="Pains des habituels sans commande.")
    guichet = serializers.IntegerField(help_text="Pains au guichet, moyenne.")
    estimee = serializers.IntegerField(help_text="Demande estimée : les trois sources.")
    base = serializers.IntegerField(help_text="Sacs pour les commandes.")
    supplement = serializers.IntegerField(help_text="Sacs ajoutés par le chef.")
    besoin = serializers.IntegerField(
        help_text="Sacs à ajouter pour la demande estimée.",
    )
    au_dessus_du_plan = serializers.BooleanField()
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
    motif_supplement = serializers.CharField(allow_blank=True)
    valide_par = serializers.CharField(allow_blank=True)
    valide_le = serializers.DateTimeField(allow_null=True)
    validation_auto = serializers.BooleanField()
    heure_validation_auto = serializers.DateTimeField(
        help_text="T-15 min avant le pétrissage : sans réponse, décision automatique.",
    )
    alerte = serializers.BooleanField(help_text="Demande estimée au-dessus du plan.")
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
    enregistre = PlanProduction.objects.filter(
        jour=plan.session.jour,
        creneau=plan.session.creneau,
    ).first()
    ecart = None
    if plan.moyenne_sacs:
        ecart = round(
            (Decimal(plan.sacs) - plan.moyenne_sacs) * 100 / plan.moyenne_sacs,
        )
    return {
        "jour": plan.session.jour,
        "creneau": plan.session.creneau,
        "statut": plan.enregistre.statut if plan.enregistre else None,
        "motif_supplement": plan.enregistre.motif if plan.enregistre else "",
        "valide_par": enregistre.valide_par_nom if enregistre else "",
        "valide_le": enregistre.valide_le if enregistre else None,
        "validation_auto": enregistre.validation_auto if enregistre else False,
        "heure_validation_auto": heure_validation_auto(
            plan.session,
            petrissage(plan.session.creneau),
        ),
        "alerte": plan.alerte,
        "lignes": [
            {
                "code": item.code,
                "version_fiche": item.rendement.version,
                "pains_par_sac": item.rendement.pains_par_sac,
                "commandes": item.commandes,
                "habituels": item.demande.habituels,
                "guichet": item.demande.guichet,
                "estimee": item.demande.estimee,
                "base": item.base,
                "supplement": item.supplement,
                "besoin": item.besoin,
                "au_dessus_du_plan": item.au_dessus_du_plan,
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
        if self.action == "valider":
            return [ProfilParmi(*DIRECTION)()]
        return [ProfilParmi("production")()]

    @extend_schema(
        request=SessionProductionSerializer,
        responses={200: PlanSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def valider(self, request: Request) -> Response:
        """Le gérant de la semaine ou le propriétaire valide, au poste ou à distance."""
        corps = SessionProductionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                plan = cas.valider(
                    depots,
                    session=corps.session(),
                    nombre=nombre_de_sessions(),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(PlanSerializer(projeter(plan)).data)

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
        request=PropositionPlanSerializer,
        responses={200: PlanSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def proposer(self, request: Request) -> Response:
        """Le chef ajoute un supplément motivé et propose ; le gérant est prévenu."""
        corps = PropositionPlanSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                plan = cas.proposer(
                    depots,
                    session=corps.session(),
                    nombre=nombre_de_sessions(),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                    supplement=corps.validated_data.get("supplement"),
                    motif=corps.validated_data.get("motif"),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(PlanSerializer(projeter(plan)).data)
