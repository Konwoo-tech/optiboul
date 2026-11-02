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
from optiboul.clients.infrastructure.models import Client
from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.notifications.domain.envois import masquer_telephone
from optiboul.ventes.application import commandes as cas
from optiboul.ventes.application import habitudes as cas_habitudes
from optiboul.ventes.application.commandes import SAISISSENT_LES_COMMANDES
from optiboul.ventes.domain.commandes import JOUR
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.domain.commandes import heure_limite
from optiboul.ventes.domain.commandes import session_visee
from optiboul.ventes.infrastructure.commandes import depots
from optiboul.ventes.infrastructure.commandes import limites
from optiboul.ventes.infrastructure.habitudes import historique
from optiboul.ventes.infrastructure.habitudes import nombre_de_sessions
from optiboul.ventes.infrastructure.habitudes import rappeler
from optiboul.ventes.infrastructure.habitudes import relances_de_la_session
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
            "tardive",
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


class RappelSerializer(serializers.Serializer):
    statut = serializers.CharField(
        help_text="État du WhatsApp : en_attente, envoye, echec.",
    )
    automatique = serializers.BooleanField()
    cree_le = serializers.DateTimeField()


class HabituelSerializer(serializers.Serializer):
    client = ClientResumeSerializer()
    telephone = serializers.CharField()
    commande = Lignes
    sessions = serializers.IntegerField(
        help_text="Sessions commandées parmi les N dernières.",
    )
    rappel = RappelSerializer(allow_null=True)


class ClientDeLaSessionSerializer(SessionVenteSerializer):
    client = serializers.IntegerField()


class RelanceHabituelsSerializer(SessionVenteSerializer):
    clients = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="Sans liste : tous les habituels sans commande.",
    )


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
        if self.action in {"list", "retrieve", "sacs", "habituels_sans_commande"}:
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

    @extend_schema(
        parameters=PARAMETRES_SESSION,
        responses=HabituelSerializer(many=True),
    )
    @action(detail=False, url_path="habituels-sans-commande")
    def habituels_sans_commande(self, request: Request) -> Response:
        """Au-dessus des commandes : les habitués qui n'ont pas commandé (O18)."""
        session = _session_de(request)
        trouves = cas_habitudes.habituels(
            depots,
            historique,
            session=session,
            nombre=nombre_de_sessions(),
        )
        clients = Client.objects.in_bulk([h.client for h in trouves])
        rappels = relances_de_la_session(session)
        lignes = []
        for habituel in sorted(trouves, key=lambda h: clients[h.client].nom):
            client = clients[habituel.client]
            rappel = rappels.get(client.pk)
            lignes.append(
                {
                    "client": {"id": client.pk, "nom": client.nom},
                    "telephone": masquer_telephone(client.telephone)
                    if client.telephone
                    else "",
                    "commande": habituel.commande,
                    "sessions": habituel.sessions,
                    "rappel": {
                        "statut": rappel.message.statut,
                        "automatique": rappel.automatique,
                        "cree_le": rappel.cree_le,
                    }
                    if rappel
                    else None,
                },
            )
        return Response(HabituelSerializer(lignes, many=True).data)

    @extend_schema(
        request=ClientDeLaSessionSerializer,
        responses={201: CommandeSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"], url_path="reprendre-habituelle")
    def reprendre_habituelle(self, request: Request) -> Response:
        """Le client confirme : sa commande habituelle en un clic (O3)."""
        corps = ClientDeLaSessionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                commande = cas_habitudes.reprendre_habituelle(
                    depots,
                    historique,
                    client_id=corps.validated_data["client"],
                    session=corps.session(),
                    nombre=nombre_de_sessions(),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                    limites=limites(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            CommandeSerializer(self.get_queryset().get(pk=commande.id)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=RelanceHabituelsSerializer,
        responses=RappelSerializer(many=True),
    )
    @action(detail=False, methods=["post"], url_path="relancer-habituels")
    def relancer_habituels(self, request: Request) -> Response:
        """Relance WhatsApp, un par un ou tous, par la file d'envoi (O15)."""
        corps = RelanceHabituelsSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        session = corps.session()
        choisis = corps.validated_data.get("clients")
        a_rappeler = [
            habituel
            for habituel in cas_habitudes.habituels(
                depots,
                historique,
                session=session,
                nombre=nombre_de_sessions(),
            )
            if choisis is None or habituel.client in choisis
        ]
        with transaction.atomic():
            rappels = rappeler(
                a_rappeler,
                session=session,
                auteur=auteur_de(request),
                automatique=False,
            )
        return Response(
            RappelSerializer(
                [
                    {
                        "statut": r.message.statut,
                        "automatique": r.automatique,
                        "cree_le": r.cree_le,
                    }
                    for r in rappels
                ],
                many=True,
            ).data,
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
