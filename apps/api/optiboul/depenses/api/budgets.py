"""Budget mensuel par catégorie (US-113, CdC §5.8)."""

from __future__ import annotations

from datetime import date
from datetime import datetime
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.depenses.domain.depenses import StatutBudget
from optiboul.depenses.domain.depenses import part_du_budget
from optiboul.depenses.domain.depenses import statut_budget
from optiboul.depenses.infrastructure.models import CATEGORIES
from optiboul.depenses.infrastructure.models import BudgetMensuel
from optiboul.depenses.infrastructure.models import Depense

if TYPE_CHECKING:
    from rest_framework.request import Request


class LigneBudgetSerializer(serializers.Serializer):
    categorie = serializers.CharField()
    libelle = serializers.CharField()
    budget = serializers.IntegerField()
    depense = serializers.IntegerField(help_text="Dépenses validées du mois, en FCFA.")
    part = serializers.IntegerField(allow_null=True, help_text="Part consommée, en %.")
    statut = serializers.ChoiceField(choices=[s.value for s in StatutBudget])


class BudgetSerializer(serializers.Serializer):
    mois = serializers.CharField(help_text="AAAA-MM")
    lignes = LigneBudgetSerializer(many=True)
    budget = serializers.IntegerField()
    depense = serializers.IntegerField()


class FixerBudgetSerializer(serializers.Serializer):
    mois = serializers.RegexField(r"^\d{4}-(0[1-9]|1[0-2])$", help_text="AAAA-MM")
    montants = serializers.DictField(
        child=serializers.IntegerField(min_value=0),
        help_text="Catégorie → budget du mois en FCFA.",
    )

    def validate_montants(self, montants: dict[str, int]) -> dict[str, int]:
        connues = {code for code, _ in CATEGORIES}
        if inconnues := sorted(set(montants) - connues):
            message = f"Catégories inconnues : {', '.join(inconnues)}."
            raise serializers.ValidationError(message)
        return montants


def premier_jour(mois: str) -> date:
    return datetime.strptime(mois, "%Y-%m").date().replace(day=1)  # noqa: DTZ007


def budget_du_mois(debut: date) -> dict[str, Any]:
    fin = date(debut.year + debut.month // 12, debut.month % 12 + 1, 1)
    budgets = dict(
        BudgetMensuel.objects.filter(mois=debut).values_list("categorie", "montant"),
    )
    depenses = dict(
        Depense.objects.filter(
            statut="validee",
            cree_le__date__gte=debut,
            cree_le__date__lt=fin,
        )
        .values("categorie")
        .annotate(total=Sum("montant"))
        .values_list("categorie", "total"),
    )
    seuil = parametre("seuil_budget_surveiller")
    lignes = []
    for code, libelle in CATEGORIES:
        prevu, depense = budgets.get(code, 0), depenses.get(code, 0)
        lignes.append(
            {
                "categorie": code,
                "libelle": libelle,
                "budget": prevu,
                "depense": depense,
                "part": part_du_budget(depense, prevu),
                "statut": statut_budget(depense, prevu, seuil),
            },
        )
    return {
        "mois": f"{debut:%Y-%m}",
        "lignes": lignes,
        "budget": sum(ligne["budget"] for ligne in lignes),
        "depense": sum(ligne["depense"] for ligne in lignes),
    }


class BudgetsViewSet(ViewSet):
    """La direction suit le budget ; le propriétaire le fixe."""

    def get_permissions(self):
        if self.action == "fixer":
            return [ProfilParmi("proprietaire")()]
        return [ProfilParmi(*DIRECTION)()]

    @extend_schema(
        parameters=[OpenApiParameter("mois", str, description="AAAA-MM ; ce mois-ci")],
        responses=BudgetSerializer,
    )
    def list(self, request: Request) -> Response:
        mois = request.query_params.get("mois") or f"{timezone.localdate():%Y-%m}"
        parametres = FixerBudgetSerializer(data={"mois": mois, "montants": {}})
        parametres.is_valid(raise_exception=True)
        return Response(BudgetSerializer(budget_du_mois(premier_jour(mois))).data)

    @extend_schema(request=FixerBudgetSerializer, responses=BudgetSerializer)
    @action(detail=False, methods=["put"])
    def fixer(self, request: Request) -> Response:
        corps = FixerBudgetSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        debut = premier_jour(corps.validated_data["mois"])
        avant = dict(
            BudgetMensuel.objects.filter(mois=debut).values_list(
                "categorie",
                "montant",
            ),
        )
        auteur = auteur_de(request)
        assert auteur.utilisateur_id is not None
        with transaction.atomic():
            for categorie, montant in corps.validated_data["montants"].items():
                BudgetMensuel.objects.update_or_create(
                    mois=debut,
                    categorie=categorie,
                    defaults={"montant": montant, "fixe_par_id": auteur.utilisateur_id},
                )
            journaliser(
                "budget.fixe",
                auteur=auteur,
                objet_type="budget",
                objet_id=f"{debut:%Y-%m}",
                avant=avant,
                apres=dict(
                    BudgetMensuel.objects.filter(mois=debut).values_list(
                        "categorie",
                        "montant",
                    ),
                ),
            )
        return Response(BudgetSerializer(budget_du_mois(debut)).data)
