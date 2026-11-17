"""Plan et production d'une session (US-081, US-086, US-082, US-083, CdC §5.5)."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.db.models import IntegerField
from django.db.models import OuterRef
from django.db.models import Subquery
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.sauvegardes import demander_sauvegarde
from optiboul.production.application import plans as cas
from optiboul.production.application import productions as cas_production
from optiboul.production.application import supplements as cas_supplements
from optiboul.production.domain.plan import MotifSupplement
from optiboul.production.domain.plan import StatutPlan
from optiboul.production.domain.plan import heure_validation_auto
from optiboul.production.domain.plan import session_de_production
from optiboul.production.domain.production import consommation_theorique
from optiboul.production.domain.production import reste_a_produire
from optiboul.production.infrastructure.models import Fournee
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.models import Production
from optiboul.production.infrastructure.plans import depots
from optiboul.production.infrastructure.plans import nombre_de_sessions
from optiboul.production.infrastructure.plans import petrissage
from optiboul.production.infrastructure.productions import depots as depots_production
from optiboul.production.infrastructure.productions import nom_de
from optiboul.production.infrastructure.supplements import depots as depots_supplements
from optiboul.production.infrastructure.supplements import seuils
from optiboul.stocks.infrastructure.stocks import stock
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
    propose_par = serializers.CharField(
        allow_blank=True,
        help_text="Vide tant que le plan n'est pas proposé.",
    )
    propose_le = serializers.DateTimeField(allow_null=True)
    valide_par = serializers.CharField(allow_blank=True)
    valide_le = serializers.DateTimeField(allow_null=True)
    validation_auto = serializers.BooleanField()
    heure_validation_auto = serializers.DateTimeField(
        help_text="T-15 min avant le pétrissage : sans réponse, décision automatique.",
    )
    alerte = serializers.BooleanField(help_text="Demande estimée au-dessus du plan.")
    farine_en_stock = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        help_text="Stock de farine, en kg, pour décider d'un supplément.",
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
    enregistre = (
        PlanProduction.objects.select_related("propose_par")
        .filter(jour=plan.session.jour, creneau=plan.session.creneau)
        .first()
    )
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
        "propose_par": nom_de(enregistre.propose_par) if enregistre else "",
        "propose_le": enregistre.propose_le if enregistre else None,
        "valide_par": enregistre.valide_par_nom if enregistre else "",
        "valide_le": enregistre.valide_le if enregistre else None,
        "validation_auto": enregistre.validation_auto if enregistre else False,
        "heure_validation_auto": heure_validation_auto(
            plan.session,
            petrissage(plan.session.creneau),
        ),
        "alerte": plan.alerte,
        "farine_en_stock": stock.quantites().get("farine", Decimal(0)),
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


class ProduitProduitSerializer(serializers.Serializer):
    code = serializers.CharField()
    sacs = serializers.IntegerField()
    prevus = serializers.IntegerField()
    realise = serializers.IntegerField()
    reste = serializers.IntegerField(
        help_text="Reste à produire : prévu moins réalisé.",
    )


class MatiereConsommeeSerializer(serializers.Serializer):
    matiere = serializers.CharField()
    theorique = serializers.DecimalField(max_digits=12, decimal_places=3)
    reelle = serializers.DecimalField(max_digits=12, decimal_places=3, allow_null=True)
    justification = serializers.CharField(allow_blank=True)


class ProductionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    jour = serializers.DateField()
    creneau = serializers.CharField()
    statut = serializers.CharField()
    produits = ProduitProduitSerializer(many=True)
    consommation = MatiereConsommeeSerializer(many=True)
    prevus = serializers.IntegerField()
    realise = serializers.IntegerField()
    reste = serializers.IntegerField()
    ouverte_par = serializers.CharField()
    ouverte_le = serializers.DateTimeField()
    cloturee_par = serializers.CharField(
        allow_blank=True,
        help_text="Vide tant que la production n'est pas clôturée.",
    )
    cloturee_le = serializers.DateTimeField(allow_null=True)
    tolerance_ecart_kg = serializers.IntegerField(
        help_text="Écart matière toléré, en kg par sac (R10).",
    )
    tolerance_ecart_pourcent = serializers.IntegerField(
        help_text="Écart toléré des intrants en grammes, en % de la recette (R10).",
    )


class ResponsableSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField()


class ResumeProductionSerializer(serializers.Serializer):
    """Une ligne de l'historique des productions d'une semaine."""

    id = serializers.IntegerField()
    jour = serializers.DateField()
    creneau = serializers.CharField()
    statut = serializers.CharField(help_text="en_cours, cloturee ou non_cloturee.")
    responsable = ResponsableSerializer(help_text="Qui a ouvert la production.")
    plan_valide_par = serializers.CharField(allow_blank=True)
    ouverte_le = serializers.DateTimeField()
    cloturee_le = serializers.DateTimeField(allow_null=True)
    sacs = serializers.IntegerField()
    prevus = serializers.IntegerField()
    realise = serializers.IntegerField()
    ecart_matiere_kg = serializers.DecimalField(
        max_digits=12,
        decimal_places=3,
        allow_null=True,
        help_text="Farine réelle moins théorique, en kg ; vide sans consommation.",
    )
    motif_ecart = serializers.CharField(
        allow_blank=True,
        help_text="Justification de l'écart de farine (R10).",
    )


class PageDeProductionsSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = ResumeProductionSerializer(many=True)


class SupplementSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    statut = serializers.CharField(
        help_text="auto_accorde (O17), demande, accorde ou refuse.",
    )
    sacs = serializers.DictField(child=serializers.IntegerField())
    motif = serializers.CharField()
    farine_necessaire = serializers.DecimalField(max_digits=12, decimal_places=3)
    farine_en_stock = serializers.DecimalField(max_digits=14, decimal_places=3)
    demande = serializers.CharField(
        allow_blank=True,
        help_text="DEM-xxx au-delà du seuil.",
    )


class FourneeSaisieSerializer(serializers.Serializer):
    numero = serializers.IntegerField(
        help_text="Rang dans la production, à partir de 1 ; la dernière s'annule.",
    )
    produit = serializers.CharField()
    pains = serializers.IntegerField()
    saisie_le = serializers.DateTimeField()


class ResteAProduireSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.CharField()
    statut = serializers.CharField(
        allow_null=True,
        help_text="Statut de la production ; vide tant qu'elle n'est pas ouverte.",
    )
    produits = ProduitProduitSerializer(many=True)
    reste = serializers.IntegerField()
    fournees = FourneeSaisieSerializer(many=True)
    mis_a_jour = serializers.DateTimeField(allow_null=True)
    rafraichir_secondes = serializers.IntegerField(
        help_text="Les postes ouverts relisent au plus tard après ce délai (ADR-21).",
    )


RAFRAICHISSEMENT = 15


class FourneeSerializer(serializers.Serializer):
    produit = serializers.CharField(max_length=10)
    pains = serializers.IntegerField(min_value=1)


class ConsommationSerializer(serializers.Serializer):
    quantites = serializers.DictField(
        child=serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0),
        help_text="Code de la matière → quantité réelle, dans l'unité de la matière.",
    )
    justifications = serializers.DictField(
        child=serializers.CharField(max_length=255, allow_blank=True),
        required=False,
        default=dict,
        help_text="Code de la matière → justification de l'écart (R10).",
    )


def projeter_production(production: cas_production.EtatProduction) -> dict[str, Any]:
    reste = reste_a_produire(production.prevus, production.realise)
    theorique = consommation_theorique(production.sacs, production.recettes)
    matieres = sorted(set(theorique) | set(production.consommation))
    return {
        "id": production.id,
        "jour": production.session.jour,
        "creneau": production.session.creneau,
        "statut": production.statut,
        "produits": [
            {
                "code": code,
                "sacs": sacs,
                "prevus": production.prevus.get(code, 0),
                "realise": production.realise.get(code, 0),
                "reste": reste.get(code, 0),
            }
            for code, sacs in production.sacs.items()
        ],
        "consommation": [
            {
                "matiere": matiere,
                "theorique": theorique.get(matiere, Decimal(0)),
                "reelle": production.consommation.get(matiere),
                "justification": production.justifications.get(matiere, ""),
            }
            for matiere in matieres
        ],
        "prevus": sum(production.prevus.values()),
        "realise": sum(production.realise.values()),
        "reste": sum(reste.values()),
        "ouverte_par": production.ouverte_par,
        "ouverte_le": production.ouverte_le,
        "cloturee_par": production.cloturee_par,
        "cloturee_le": production.cloturee_le,
        "tolerance_ecart_kg": parametre("ecart_matiere_kg_par_sac"),
        "tolerance_ecart_pourcent": parametre("ecart_matiere_grammes"),
    }


FARINE = "farine"

REALISE = Coalesce(
    Subquery(
        Fournee.objects.filter(production=OuterRef("pk"))
        .order_by()
        .values("production")
        .annotate(total=Sum("pains"))
        .values("total"),
        output_field=IntegerField(),
    ),
    0,
)


def resumer(production: Production) -> dict[str, Any]:
    """Lit les lignes du plan et la consommation préchargées : aucune requête."""
    lignes = list(production.plan.lignes.all())
    sacs = {ligne.produit.code: ligne.sacs for ligne in lignes}
    recettes = {
        ligne.produit.code: {
            r.matiere.code: r.quantite for r in ligne.fiche.recette.all()
        }
        for ligne in lignes
    }
    farine = next(
        (c for c in production.consommations.all() if c.matiere.code == FARINE),
        None,
    )
    ecart = None
    if farine is not None:
        theorique = consommation_theorique(sacs, recettes).get(FARINE, Decimal(0))
        ecart = farine.quantite - theorique
    return {
        "id": production.pk,
        "jour": production.plan.jour,
        "creneau": production.plan.creneau,
        "statut": production.statut,
        "responsable": {
            "id": production.ouverte_par_id,
            "nom": nom_de(production.ouverte_par),
        },
        "plan_valide_par": production.plan.valide_par_nom,
        "ouverte_le": production.ouverte_le,
        "cloturee_le": production.cloturee_le,
        "sacs": sum(sacs.values()),
        "prevus": sum(ligne.pains_prevus for ligne in lignes),
        "realise": getattr(production, "realise", 0),
        "ecart_matiere_kg": ecart,
        "motif_ecart": farine.justification if farine else "",
    }


class FiltreProductionsSerializer(serializers.Serializer):
    semaine = serializers.IntegerField(required=False, min_value=1)


IDENTIFIANT = OpenApiParameter("id", int, OpenApiParameter.PATH)

PARAMETRES_SESSION = [
    OpenApiParameter("jour", str, description="AAAA-MM-JJ, avec le créneau"),
    OpenApiParameter("creneau", str, enum=[JOUR, NUIT]),
]


class ProductionsViewSet(ViewSet):
    lookup_value_regex = r"[0-9]+"

    def get_permissions(self):
        if self.action in {"plan", "list"}:
            return [ProfilParmi(*LISENT_LE_PLAN)()]
        if self.action in {"en_cours", "retrieve", "reste_a_produire"}:
            # Le reste à produire est visible aussi de la caisse (CdC §5.5).
            return [ProfilParmi("caissier", *LISENT_LE_PLAN)()]
        if self.action == "valider":
            return [ProfilParmi(*DIRECTION)()]
        return [ProfilParmi("production")()]

    @extend_schema(
        parameters=[
            OpenApiParameter("semaine", int, description="Identifiant de la semaine"),
            OpenApiParameter("page", int),
        ],
        responses=PageDeProductionsSerializer,
    )
    def list(self, request: Request) -> Response:
        """Historique des productions, la plus récente d'abord (écran Production)."""
        filtre = FiltreProductionsSerializer(data=request.query_params)
        filtre.is_valid(raise_exception=True)
        productions = (
            Production.objects.select_related("plan", "ouverte_par")
            .prefetch_related(
                "plan__lignes__produit",
                "plan__lignes__fiche__recette__matiere",
                "consommations__matiere",
            )
            .annotate(realise=REALISE)
            .order_by("-plan__jour", "-plan__creneau", "-id")
        )
        if "semaine" in filtre.validated_data:
            productions = productions.filter(
                semaine_id=filtre.validated_data["semaine"],
            )
        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(productions, request, view=self)
        assert page is not None
        return pagination.get_paginated_response(
            ResumeProductionSerializer([resumer(p) for p in page], many=True).data,
        )

    @extend_schema(
        request=PropositionPlanSerializer,
        responses={201: SupplementSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def supplement(self, request: Request) -> Response:
        """Après validation : accordé tout de suite sous le seuil (O17), sinon demandé
        au gérant (R15)."""
        corps = PropositionPlanSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                etat = cas_supplements.ajouter(
                    depots_supplements,
                    session=corps.session(),
                    sacs=corps.validated_data.get("supplement", {}),
                    motif=corps.validated_data.get("motif"),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                    seuils=seuils(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(SupplementSerializer(vars(etat)).data, status=201)

    def _production(self, appel) -> Response:
        try:
            with transaction.atomic():
                production = appel()
        except RefusMetier as refus:
            return probleme(refus)
        return Response(ProductionSerializer(projeter_production(production)).data)

    @extend_schema(
        request=SessionProductionSerializer,
        responses={200: ProductionSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def ouvrir(self, request: Request) -> Response:
        """Le responsable de production ouvre sur un plan validé ou provisoire."""
        corps = SessionProductionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        return self._production(
            lambda: cas_production.ouvrir(
                depots_production,
                session=corps.session(),
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            ),
        )

    @extend_schema(
        parameters=PARAMETRES_SESSION,
        responses={200: ProductionSerializer, 404: ProblemeSerializer},
    )
    @action(detail=False, url_path="en-cours")
    def en_cours(self, request: Request) -> Response:
        """Prévu, réalisé et reste à produire par produit ; consommation."""
        parametres = SessionProductionSerializer(data=request.query_params)
        parametres.is_valid(raise_exception=True)
        production = depots_production.productions.de_la_session(parametres.session())
        if production is None:
            message = "La production de cette session n'est pas ouverte."
            return probleme(RefusMetier("production_inconnue", message))
        return Response(ProductionSerializer(projeter_production(production)).data)

    @extend_schema(parameters=PARAMETRES_SESSION, responses=ResteAProduireSerializer)
    @action(detail=False, url_path="reste-a-produire")
    def reste_a_produire(self, request: Request) -> Response:
        """Prévu, réalisé et reste par produit, à jour de la dernière fournée."""
        parametres = SessionProductionSerializer(data=request.query_params)
        parametres.is_valid(raise_exception=True)
        session = parametres.session()
        production = depots_production.productions.de_la_session(session)
        if production is not None:
            prevus, realise = production.prevus, production.realise
            statut: str | None = production.statut
        else:
            plan = PlanProduction.objects.filter(
                jour=session.jour,
                creneau=session.creneau,
            ).first()
            prevus = (
                {ligne.produit.code: ligne.pains_prevus for ligne in plan.lignes.all()}
                if plan
                else {}
            )
            realise, statut = {}, None
        reste = reste_a_produire(prevus, realise)
        fournees = (
            Fournee.objects.filter(
                production__plan__jour=session.jour,
                production__plan__creneau=session.creneau,
            )
            .select_related("produit")
            .order_by("-cree_le", "-id")
        )
        derniere = fournees.first()
        nombre = fournees.count()
        reponse = Response(
            ResteAProduireSerializer(
                {
                    "jour": session.jour,
                    "creneau": session.creneau,
                    "statut": statut,
                    "produits": [
                        {
                            "code": code,
                            "sacs": production.sacs.get(code, 0) if production else 0,
                            "prevus": pains,
                            "realise": realise.get(code, 0),
                            "reste": reste[code],
                        }
                        for code, pains in prevus.items()
                        if pains
                    ],
                    "reste": sum(reste.values()),
                    "fournees": [
                        {
                            "numero": nombre - rang,
                            "produit": f.produit.code,
                            "pains": f.pains,
                            "saisie_le": f.cree_le,
                        }
                        for rang, f in enumerate(fournees[:20])
                    ],
                    "mis_a_jour": derniere.cree_le if derniere else None,
                    "rafraichir_secondes": RAFRAICHISSEMENT,
                },
            ).data,
        )
        # Lu toutes les 15 s : jamais servi depuis un cache intermédiaire.
        reponse["Cache-Control"] = "no-store"
        return reponse

    @extend_schema(
        request=FourneeSerializer,
        parameters=[IDENTIFIANT],
        responses={200: ProductionSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def fournee(self, request: Request, pk: str) -> Response:
        """Pains d'une fournée : le réalisé et le reste à produire suivent."""
        corps = FourneeSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        return self._production(
            lambda: cas_production.saisir_fournee(
                depots_production,
                production_id=int(pk),
                code=corps.validated_data["produit"],
                pains=corps.validated_data["pains"],
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            ),
        )

    @extend_schema(
        request=None,
        parameters=[
            IDENTIFIANT,
            OpenApiParameter("numero", int, OpenApiParameter.PATH),
        ],
        responses={
            200: ProductionSerializer,
            404: ProblemeSerializer,
            409: ProblemeSerializer,
        },
    )
    @action(
        detail=True,
        methods=["delete"],
        url_path=r"fournee/(?P<numero>[0-9]+)",
        url_name="fournee-annuler",
    )
    def annuler_fournee(self, request: Request, pk: str, numero: str) -> Response:
        """Corrige une fournée saisie par erreur : la dernière seulement, par le
        responsable, tant que la production est en cours. Elle reste au journal."""
        return self._production(
            lambda: cas_production.annuler_fournee(
                depots_production,
                production_id=int(pk),
                numero=int(numero),
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            ),
        )

    @extend_schema(
        request=ConsommationSerializer,
        parameters=[IDENTIFIANT],
        responses={200: ProductionSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["put"])
    def consommation(self, request: Request, pk: str) -> Response:
        """Consommation réelle, la valeur théorique à côté de chaque matière."""
        corps = ConsommationSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        return self._production(
            lambda: cas_production.saisir_consommation(
                depots_production,
                production_id=int(pk),
                quantites=dict(corps.validated_data["quantites"]),
                justifications=dict(corps.validated_data["justifications"]),
                tolerance=cas_production.ToleranceMatiere(
                    kg_par_sac=parametre("ecart_matiere_kg_par_sac"),
                    pourcent=parametre("ecart_matiere_grammes"),
                ),
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            ),
        )

    @extend_schema(
        request=None,
        parameters=[IDENTIFIANT],
        responses={200: ProductionSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def cloturer(self, request: Request, pk: str) -> Response:
        """R5 : impossible sans réalisé ni consommation ; sauvegarde à la clôture."""

        def cloturer_et_sauvegarder():
            production = cas_production.cloturer(
                depots_production,
                production_id=int(pk),
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            )
            demander_sauvegarde(Declencheur.CLOTURE_PRODUCTION)
            return production

        return self._production(cloturer_et_sauvegarder)

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
