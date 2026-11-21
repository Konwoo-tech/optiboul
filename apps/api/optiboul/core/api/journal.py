"""Consultation du journal (US-024) : filtres auteur, type, famille, période ;
libellés lisibles et total (#361) ; lecture seule."""

from __future__ import annotations

from datetime import datetime
from datetime import time
from typing import TYPE_CHECKING
from typing import Any

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_view
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.mixins import ListModelMixin
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.domain.libelles_journal import Famille
from optiboul.core.domain.libelles_journal import famille_de
from optiboul.core.domain.libelles_journal import libelle
from optiboul.core.domain.libelles_journal import prefixes_de
from optiboul.core.infrastructure.models import LigneJournal

from .permissions import DIRECTION
from .permissions import ProfilParmi

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from rest_framework.request import Request


class LigneJournalSerializer(serializers.ModelSerializer[LigneJournal]):
    libelle = serializers.SerializerMethodField()
    libelle_en = serializers.SerializerMethodField()
    famille = serializers.SerializerMethodField()
    objet_libelle = serializers.SerializerMethodField()

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
            "libelle",
            "libelle_en",
            "famille",
            "objet_type",
            "objet_id",
            "objet_libelle",
            "avant",
            "apres",
        ]
        read_only_fields = fields

    def get_libelle(self, ligne: LigneJournal) -> str:
        """« Caisse ouverte » ; un code inconnu : « Famille : reste du code »."""
        return libelle(ligne.action)

    def get_libelle_en(self, ligne: LigneJournal) -> str:
        return libelle(ligne.action, "en")

    def get_famille(self, ligne: LigneJournal) -> str:
        return famille_de(ligne.action)

    def get_objet_libelle(self, ligne: LigneJournal) -> str:
        """« Caisse de jour du 19/11 » ; vide sans objet."""
        libelles = self.context.get("objets", {})
        return libelles.get((ligne.objet_type, ligne.objet_id), "")


class ActeurSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nom = serializers.CharField()
    profil = serializers.CharField(allow_null=True)


class PaginationJournal(CursorPagination):
    """Curseur (rapide sur un journal qui grossit) et total des lignes filtrées."""

    ordering = ("-horodatage", "-id")
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        self.total = queryset.count()
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data: Any) -> Response:
        reponse = super().get_paginated_response(data)
        reponse.data["total"] = self.total
        return reponse

    def get_paginated_response_schema(self, schema: dict) -> dict:
        reponse = super().get_paginated_response_schema(schema)
        reponse["required"] = [*reponse.get("required", []), "total"]
        reponse["properties"]["total"] = {
            "type": "integer",
            "description": "Lignes qui répondent aux filtres, toutes pages.",
        }
        return reponse


# Type d'objet → (application, modèle, mise en forme) ; les autres : « Type n° id ».
def _jour(d: Any) -> str:
    return f"{d:%d/%m}"


OBJETS: dict[str, tuple[str, str, Any]] = {
    "caisse": (
        "caisse",
        "Caisse",
        lambda o: f"Caisse de {o.creneau} du {_jour(o.jour)}",
    ),
    "semaine": ("core", "Semaine", lambda o: f"Semaine {o.numero} de {o.annee}"),
    "depense": ("depenses", "Depense", lambda o: f"DEP-{o.numero:04d}"),
    "demande": ("demandes", "Demande", lambda o: f"DEM-{o.numero:03d}"),
    "production": (
        "production",
        "Production",
        lambda o: f"Production de {o.plan.creneau} du {_jour(o.plan.jour)}",
    ),
    "client": ("clients", "Client", lambda o: o.nom),
    "fournisseur": ("achats", "Fournisseur", lambda o: o.nom),
    "facture": ("achats", "FactureFournisseur", lambda o: f"FAC-{o.numero}"),
    "employe": ("paie", "Employe", lambda o: o.nom),
    "groupe": ("auth", "Group", lambda o: o.name),
    "utilisateur": ("users", "User", lambda o: o.name or o.email),
}
TYPES = {
    "livraison": "Livraison",
    "commande": "Commande",
    "encaissement": "Encaissement",
    "sauvegarde": "Sauvegarde",
    "reception_planifiee": "Réception planifiée",
    "reception": "Réception",
    "manquant": "Manquant",
    "etat_paie": "État de paie",
    "ligne_paie": "Ligne de paie",
    "element_paie": "Élément de paie",
    "controle_stock": "Contrôle de stock",
    "produit": "Produit",
    "plan": "Plan de production",
    "supplement": "Supplément",
    "poste": "Poste",
    "matiere": "Matière",
}


def libelles_des_objets(lignes: list[LigneJournal]) -> dict[tuple[str, str], str]:
    """Une requête par type d'objet présent dans la page, jamais par ligne."""
    par_type: dict[str, set[str]] = {}
    for ligne in lignes:
        if ligne.objet_type and ligne.objet_id:
            par_type.setdefault(ligne.objet_type, set()).add(ligne.objet_id)
    libelles: dict[tuple[str, str], str] = {}
    for genre, ids in par_type.items():
        if genre in OBJETS:
            application, modele, former = OBJETS[genre]
            objets = apps.get_model(application, modele).objects.filter(
                pk__in=[i for i in ids if i.isdigit()],
            )
            if genre == "production":
                objets = objets.select_related("plan")
            for objet in objets:
                libelles[(genre, str(objet.pk))] = former(objet)
        for identifiant in ids:
            cle = (genre, identifiant)
            if cle not in libelles:
                nom = TYPES.get(genre, genre.replace("_", " ").capitalize())
                libelles[cle] = f"{nom} n° {identifiant}"
    return libelles


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
                "famille",
                OpenApiTypes.STR,
                enum=[f.value for f in Famille],
                description="Famille d'actions de l'écran Journal",
            ),
            OpenApiParameter(
                "page_size",
                OpenApiTypes.INT,
                description="Lignes par page (50 par défaut, 200 au plus)",
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
        if famille := parametres.get("famille"):
            if famille not in Famille.__members__.values():
                raise ValidationError({"famille": "Famille inconnue."})
            lignes = filtrer_par_famille(lignes, Famille(famille))
        if du := _borne(parametres.get("du"), "du", fin=False):
            lignes = lignes.filter(horodatage__gte=du)
        if au := _borne(parametres.get("au"), "au", fin=True):
            lignes = lignes.filter(horodatage__lte=au)
        return lignes

    def get_serializer(self, *args: Any, **kwargs: Any) -> Any:
        if args and isinstance(args[0], list):
            kwargs.setdefault("context", self.get_serializer_context())
            kwargs["context"]["objets"] = libelles_des_objets(args[0])
        return super().get_serializer(*args, **kwargs)

    @extend_schema(responses=ActeurSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def acteurs(self, request: Request) -> Response:
        """Les personnes présentes au journal, pour le filtre par auteur (#361)."""
        ids = (
            LigneJournal.objects.exclude(acteur__isnull=True)
            .values_list("acteur_id", flat=True)
            .distinct()
        )
        personnes = (
            get_user_model().objects.filter(pk__in=ids).order_by("name", "email")
        )
        return Response(
            [
                {"id": p.pk, "nom": p.name or p.email, "profil": p.profil}
                for p in personnes
            ],
        )


def filtrer_par_famille(
    lignes: QuerySet[LigneJournal],
    famille: Famille,
) -> QuerySet[LigneJournal]:
    """Par préfixe du code d'action ; « autre » : ce qu'aucune famille ne prend."""
    if famille is Famille.AUTRE:
        connus = Q()
        for autre in Famille:
            for prefixe in prefixes_de(autre):
                connus |= Q(action__startswith=f"{prefixe}.")
        return lignes.exclude(connus)
    voulu = Q()
    for prefixe in prefixes_de(famille):
        voulu |= Q(action__startswith=f"{prefixe}.")
    return lignes.filter(voulu)
