"""Commandes par session (US-050, CdC §5.3) : saisie, reprise de la veille, sacs."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.clients.api.clients import ClientResumeSerializer
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.ventes.application import commandes as cas
from optiboul.ventes.application.commandes import SAISISSENT_LES_COMMANDES
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.commandes import heure_limite
from optiboul.ventes.domain.commandes import session_visee
from optiboul.ventes.infrastructure.commandes import depots
from optiboul.ventes.infrastructure.commandes import limites
from optiboul.ventes.infrastructure.models import Commande

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request

LISENT_LES_COMMANDES = ("caissier", "production", *DIRECTION)

Lignes = serializers.DictField(
    child=serializers.IntegerField(min_value=0),
    help_text="Code du produit → pains commandés.",
)


class CommandeSerializer(serializers.ModelSerializer[Commande]):
    client = ClientResumeSerializer()
    lignes = serializers.SerializerMethodField()
    saisie_par = serializers.CharField(source="saisie_par.name")

    class Meta:
        model = Commande
        fields = [
            "id",
            "client",
            "jour",
            "creneau",
            "lignes",
            "apres_heure_limite",
            "saisie_par",
            "saisie_le",
            "modifiee_le",
        ]
        read_only_fields = fields

    @extend_schema(responses=Lignes)
    def get_lignes(self, commande: Commande) -> dict[str, int]:
        return {ligne.produit.code: ligne.quantite for ligne in commande.lignes.all()}


class SessionVenteSerializer(serializers.Serializer):
    """Session visée ; sans jour ni créneau, la prochaine dont l'heure limite court."""

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
        return session_visee(timezone.now(), limites())


class SaisieSerializer(SessionVenteSerializer):
    client = serializers.IntegerField()
    lignes = serializers.DictField(child=serializers.IntegerField(min_value=0))


class SacsProduitSerializer(serializers.Serializer):
    code = serializers.CharField()
    pains = serializers.IntegerField()
    pains_par_sac = serializers.IntegerField()
    sacs = serializers.IntegerField()


class SacsSerializer(serializers.Serializer):
    jour = serializers.DateField()
    creneau = serializers.CharField()
    heure_limite = serializers.DateTimeField()
    apres_heure_limite = serializers.BooleanField()
    clients = serializers.IntegerField(help_text="Clients qui ont commandé.")
    produits = SacsProduitSerializer(many=True)
    total_sacs = serializers.IntegerField()


class RepriseSerializer(serializers.Serializer):
    reprises = serializers.IntegerField()
    commandes = CommandeSerializer(many=True)


PARAMETRES_SESSION = [
    OpenApiParameter("jour", str, description="AAAA-MM-JJ, avec le créneau"),
    OpenApiParameter("creneau", str, enum=[JOUR, NUIT]),
]


def _session_de(request: Request) -> Session:
    parametres = SessionVenteSerializer(data=request.query_params)
    parametres.is_valid(raise_exception=True)
    return parametres.session()


class CommandesViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    """Commandes d'une session ; la caisse et le gérant les saisissent."""

    serializer_class = CommandeSerializer
    queryset = Commande.objects.select_related("client", "saisie_par").prefetch_related(
        "lignes__produit",
    )
    pagination_class = None

    def get_permissions(self):
        if self.action in {"list", "retrieve", "sacs"}:
            return [ProfilParmi(*LISENT_LES_COMMANDES)()]
        return [ProfilParmi(*SAISISSENT_LES_COMMANDES)()]

    def get_queryset(self) -> QuerySet[Commande]:
        commandes = super().get_queryset()
        if self.action != "list":
            return commandes
        session = _session_de(self.request)
        return commandes.filter(jour=session.jour, creneau=session.creneau)

    @extend_schema(parameters=PARAMETRES_SESSION)
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=SaisieSerializer,
        responses={
            200: CommandeSerializer,
            201: CommandeSerializer,
            409: ProblemeSerializer,
        },
    )
    def create(self, request: Request) -> Response:
        """Saisit la commande du client ; une seconde saisie remplace ses lignes."""
        corps = SaisieSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                commande, creee = cas.saisir(
                    depots,
                    client_id=corps.validated_data["client"],
                    session=corps.session(),
                    lignes=corps.validated_data["lignes"],
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                    limites=limites(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            CommandeSerializer(self.get_queryset().get(pk=commande.id)).data,
            status=status.HTTP_201_CREATED if creee else status.HTTP_200_OK,
        )

    @extend_schema(request=None, responses={204: None, 409: ProblemeSerializer})
    @action(detail=True, methods=["post"])
    def annuler(self, request: Request, pk: str) -> Response:
        try:
            with transaction.atomic():
                cas.annuler(
                    depots,
                    commande_id=self.get_object().pk,
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        request=SessionVenteSerializer,
        responses={200: RepriseSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"], url_path="reprendre-veille")
    def reprendre_veille(self, request: Request) -> Response:
        """Reprend les commandes du même créneau la veille (O3)."""
        corps = SessionVenteSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                reprises = cas.reprendre_veille(
                    depots,
                    session=corps.session(),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                    limites=limites(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        commandes = self.get_queryset().filter(pk__in=[c.id for c in reprises])
        return Response(
            {
                "reprises": len(reprises),
                "commandes": CommandeSerializer(commandes, many=True).data,
            },
        )

    @extend_schema(parameters=PARAMETRES_SESSION, responses=SacsSerializer)
    @action(detail=False)
    def sacs(self, request: Request) -> Response:
        """Pains commandés et sacs à pétrir par produit (CdC §5.3)."""
        session = _session_de(request)
        par_produit = cas.sacs(depots, session)
        limite = heure_limite(session, limites())
        return Response(
            SacsSerializer(
                {
                    "jour": session.jour,
                    "creneau": session.creneau,
                    "heure_limite": limite,
                    "apres_heure_limite": timezone.now() > limite,
                    "clients": Commande.objects.filter(
                        jour=session.jour,
                        creneau=session.creneau,
                    ).count(),
                    "produits": [
                        {"code": code, **vars(ligne)}
                        for code, ligne in par_produit.items()
                    ],
                    "total_sacs": sum(ligne.sacs for ligne in par_produit.values()),
                },
            ).data,
        )
