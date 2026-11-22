"""Employés et états de paie (US-120, CdC §5.10) : gérant, propriétaire en lecture."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING
from typing import Any

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema_field
from rest_framework import mixins
from rest_framework import serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.api.erreurs import ProblemeSerializer
from optiboul.core.api.erreurs import probleme
from optiboul.core.api.idempotence import PARAMETRE as IDEMPOTENCE
from optiboul.core.api.idempotence import idempotent
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.demandes.infrastructure.models import Demande
from optiboul.paie.application import paiements as cas_paiements
from optiboul.paie.application import paies as cas
from optiboul.paie.domain.paie import GenreElement
from optiboul.paie.domain.paie import StatutPaie
from optiboul.paie.domain.paie import jour_de_paie_du_mois
from optiboul.paie.infrastructure.models import ElementPaie
from optiboul.paie.infrastructure.models import Employe
from optiboul.paie.infrastructure.models import EtatPaie
from optiboul.paie.infrastructure.models import LignePaie
from optiboul.paie.infrastructure.models import PaiementSalaire
from optiboul.paie.infrastructure.paiements import deja_paye
from optiboul.paie.infrastructure.paiements import depots as depots_paiements
from optiboul.paie.infrastructure.paiements import pdf_bulletin
from optiboul.paie.infrastructure.paiements import reste_de
from optiboul.paie.infrastructure.paies import absences_du_mois
from optiboul.paie.infrastructure.paies import calcul_de
from optiboul.paie.infrastructure.paies import depots

if TYPE_CHECKING:
    from rest_framework.request import Request


class EmployeSerializer(serializers.ModelSerializer[Employe]):
    class Meta:
        model = Employe
        fields = [
            "id",
            "nom",
            "poste",
            "telephone",
            "salaire_base",
            "utilisateur",
            "actif",
        ]
        read_only_fields = ["id"]


class EmployesViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """Un employé n'est jamais supprimé : il est désactivé, ses paies restent."""

    serializer_class = EmployeSerializer
    queryset = Employe.objects.all()
    http_method_names = ["get", "post", "put", "patch"]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [ProfilParmi(*DIRECTION)()]
        return [ProfilParmi("gerant")()]

    def perform_create(self, serializer: serializers.BaseSerializer) -> None:
        employe = serializer.save()
        journaliser(
            "employe.cree",
            auteur=auteur_de(self.request),
            objet_type="employe",
            objet_id=employe.pk,
            apres={"nom": employe.nom, "salaire_base": employe.salaire_base},
        )

    def perform_update(self, serializer: serializers.BaseSerializer) -> None:
        employe = serializer.save()
        journaliser(
            "employe.modifie",
            auteur=auteur_de(self.request),
            objet_type="employe",
            objet_id=employe.pk,
            apres={
                "nom": employe.nom,
                "salaire_base": employe.salaire_base,
                "actif": employe.actif,
            },
        )


class ElementPaieSerializer(serializers.ModelSerializer[ElementPaie]):
    auteur = serializers.CharField(source="auteur.name")

    class Meta:
        model = ElementPaie
        fields = ["id", "genre", "description", "montant", "jour", "auteur"]
        read_only_fields = fields


class NouvelElementSerializer(serializers.Serializer):
    genre = serializers.ChoiceField(choices=[g.value for g in GenreElement])
    description = serializers.CharField(max_length=255, allow_blank=True)
    montant = serializers.IntegerField()


class ModifierElementSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255, allow_blank=True)
    montant = serializers.IntegerField()


class PaiementSalaireSerializer(serializers.ModelSerializer[PaiementSalaire]):
    paye_par = serializers.CharField(source="paye_par.name")

    class Meta:
        model = PaiementSalaire
        fields = [
            "id",
            "montant",
            "mode",
            "reference",
            "depense",
            "paye_par",
            "paye_le",
        ]
        read_only_fields = fields


class PayerLigneSerializer(serializers.Serializer):
    montant = serializers.IntegerField()
    mode = serializers.ChoiceField(choices=list(cas_paiements.MODES))
    reference = serializers.CharField(
        max_length=60,
        required=False,
        default="",
        allow_blank=True,
    )


class PayerToutSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=list(cas_paiements.MODES))
    reference = serializers.CharField(
        max_length=60,
        required=False,
        default="",
        allow_blank=True,
    )


class SalairesPayesSerializer(serializers.Serializer):
    payes = serializers.IntegerField()


class LignePaieSerializer(serializers.ModelSerializer[LignePaie]):
    employe = serializers.CharField(source="employe.nom")
    employe_id = serializers.IntegerField(source="employe.pk")
    poste = serializers.CharField(source="employe.poste")
    elements = ElementPaieSerializer(many=True, read_only=True)
    paiements = PaiementSalaireSerializer(many=True, read_only=True)
    paye = serializers.SerializerMethodField()
    reste = serializers.SerializerMethodField()
    montant_absences = serializers.SerializerMethodField()
    penalites = serializers.SerializerMethodField()
    gains = serializers.SerializerMethodField()
    net = serializers.SerializerMethodField()

    class Meta:
        model = LignePaie
        fields = [
            "id",
            "employe",
            "employe_id",
            "poste",
            "base",
            "absences",
            "montant_absences",
            "avances",
            "penalites",
            "gains",
            "elements",
            "impaye",
            "net",
            "paye",
            "reste",
            "paiements",
        ]
        read_only_fields = fields

    def get_paye(self, ligne: LignePaie) -> int:
        return deja_paye(ligne)

    def get_reste(self, ligne: LignePaie) -> int:
        return reste_de(ligne)

    def get_montant_absences(self, ligne: LignePaie) -> int:
        return calcul_de(ligne).absences

    def get_penalites(self, ligne: LignePaie) -> int:
        return calcul_de(ligne).penalites

    def get_gains(self, ligne: LignePaie) -> int:
        return calcul_de(ligne).gains

    def get_net(self, ligne: LignePaie) -> int:
        """Base, moins absences, avances et pénalités, plus gains et impayé."""
        return calcul_de(ligne).net


class DemandeLieeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    numero = serializers.IntegerField()
    statut = serializers.CharField()


def jour_de_paie(etat: EtatPaie) -> date:
    """Le jour propre au mois, sinon celui du paramètre (états d'avant #353)."""
    return etat.jour_de_paie or jour_de_paie_du_mois(
        etat.mois,
        parametre("jour_de_paie"),
    )


def demande_de(etat: EtatPaie) -> Demande | None:
    """La dernière demande de validation de cet état (une par soumission)."""
    demandes = getattr(etat, "demandes_liees", None)
    if demandes is None:
        demandes = list(
            Demande.objects.filter(objet_type="etat_paie", objet_id=etat.pk).order_by(
                "-cree_le",
                "-id",
            )[:1],
        )
    return demandes[0] if demandes else None


class EtatPaieSerializer(serializers.ModelSerializer[EtatPaie]):
    lignes = LignePaieSerializer(many=True, read_only=True)
    total_net = serializers.SerializerMethodField()
    jour_de_paie = serializers.SerializerMethodField()
    soumis_par = serializers.SerializerMethodField()
    valide_par = serializers.SerializerMethodField()
    valide_le = serializers.SerializerMethodField()
    demande = serializers.SerializerMethodField()

    class Meta:
        model = EtatPaie
        fields = [
            "id",
            "mois",
            "statut",
            "jour_de_paie",
            "soumis_par",
            "valide_par",
            "valide_le",
            "demande",
            "total_net",
            "lignes",
        ]
        read_only_fields = fields

    def get_total_net(self, etat: EtatPaie) -> int:
        return sum(calcul_de(ligne).net for ligne in etat.lignes.all())

    @extend_schema_field(serializers.DateField())
    def get_jour_de_paie(self, etat: EtatPaie) -> str:
        return jour_de_paie(etat).isoformat()

    def get_soumis_par(self, etat: EtatPaie) -> str | None:
        demande = demande_de(etat)
        return demande.emetteur_nom if demande else None

    def get_valide_par(self, etat: EtatPaie) -> str | None:
        demande = demande_de(etat)
        if demande is None or demande.statut != "accordee":
            return None
        return demande.decide_par_nom

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_valide_le(self, etat: EtatPaie) -> str | None:
        demande = demande_de(etat)
        if demande is None or demande.statut != "accordee" or demande.decide_le is None:
            return None
        return demande.decide_le.isoformat()

    @extend_schema_field(DemandeLieeSerializer(allow_null=True))
    def get_demande(self, etat: EtatPaie) -> dict[str, Any] | None:
        demande = demande_de(etat)
        if demande is None:
            return None
        return {"id": demande.pk, "numero": demande.numero, "statut": demande.statut}


class JourDePaieSerializer(serializers.Serializer):
    jour = serializers.DateField(help_text="Un jour du mois de l'état.")


class MoisDuCalendrierSerializer(serializers.Serializer):
    mois = serializers.CharField(help_text="AAAA-MM.")
    etat = serializers.IntegerField(allow_null=True, help_text="Vide : pas préparé.")
    jour = serializers.DateField(help_text="Jour de paie prévu.")
    statut = serializers.ChoiceField(
        choices=["payee", "partielle", "courante", "en_retard", "a_venir"],
    )
    total = serializers.IntegerField(help_text="Net à payer du mois (FCFA).")
    impayes = serializers.IntegerField(help_text="Reste à payer (FCFA).")
    jours = serializers.ListField(
        child=serializers.DateField(),
        help_text="Jours où des salaires ont été payés.",
    )


MOIS_A_VENIR = 2


def _mois_suivant(mois: date) -> date:
    return date(mois.year + mois.month // 12, mois.month % 12 + 1, 1)


def calendrier(aujourdhui: date) -> list[dict[str, Any]]:
    """Les mois préparés, le mois courant et les deux suivants (#353)."""
    courant = aujourdhui.replace(day=1)
    etats = {
        etat.mois: etat
        for etat in EtatPaie.objects.prefetch_related(
            "lignes__elements",
            "lignes__paiements",
        )
    }
    mois = set(etats) | {courant}
    suivant = courant
    for _ in range(MOIS_A_VENIR):
        suivant = _mois_suivant(suivant)
        mois.add(suivant)
    jour_par_defaut = parametre("jour_de_paie")
    lignes: list[dict[str, Any]] = []
    for debut in sorted(mois):
        etat = etats.get(debut)
        if etat is None:
            lignes.append(
                {
                    "mois": f"{debut:%Y-%m}",
                    "etat": None,
                    "jour": jour_de_paie_du_mois(debut, jour_par_defaut),
                    "statut": "courante" if debut == courant else "a_venir",
                    "total": 0,
                    "impayes": 0,
                    "jours": [],
                },
            )
            continue
        total = 0
        paye = 0
        jours = set()
        for ligne in etat.lignes.all():
            total += calcul_de(ligne).net
            for paiement in ligne.paiements.all():
                paye += paiement.montant
                jours.add(timezone.localtime(paiement.paye_le).date())
        if etat.statut == StatutPaie.PAYEE:
            statut = "payee"
        elif etat.statut == StatutPaie.EN_PAIEMENT or paye:
            statut = "partielle"
        elif debut == courant:
            statut = "courante"
        elif debut < courant:
            statut = "en_retard"
        else:
            statut = "a_venir"
        lignes.append(
            {
                "mois": f"{debut:%Y-%m}",
                "etat": etat.pk,
                "jour": jour_de_paie(etat),
                "statut": statut,
                "total": total,
                "impayes": max(total - paye, 0),
                "jours": sorted(jours),
            },
        )
    return lignes


class AbsencesProposeesSerializer(serializers.Serializer):
    ligne = serializers.IntegerField()
    employe = serializers.CharField()
    jours = serializers.ListField(child=serializers.DateField())
    saisies = serializers.DecimalField(
        max_digits=4,
        decimal_places=1,
        help_text="Jours d'absence déjà portés sur la ligne.",
    )


class DemandeDePaieSerializer(serializers.Serializer):
    demande = serializers.CharField(help_text="DEM-xxx de la validation.")


class PreparerSerializer(serializers.Serializer):
    mois = serializers.DateField(help_text="Un jour du mois de paie.")


class ModifierLigneSerializer(serializers.Serializer):
    absences = serializers.DecimalField(max_digits=4, decimal_places=1)
    avances = serializers.IntegerField()


class PaiesViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """États de paie du plus récent au plus ancien."""

    serializer_class = EtatPaieSerializer
    queryset = EtatPaie.objects.prefetch_related(
        "lignes__employe",
        "lignes__elements__auteur",
        "lignes__paiements__paye_par",
    )
    permission_classes = [ProfilParmi(*DIRECTION)]

    @extend_schema(
        request=PreparerSerializer,
        responses={201: EtatPaieSerializer, 409: ProblemeSerializer},
    )
    @action(detail=False, methods=["post"])
    def preparer(self, request: Request) -> Response:
        """Le brouillon du mois : une ligne par employé actif."""
        corps = PreparerSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                etat = cas.preparer(
                    depots,
                    mois=corps.validated_data["mois"].replace(day=1),
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            EtatPaieSerializer(self.get_queryset().get(pk=etat)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=JourDePaieSerializer,
        responses={
            200: EtatPaieSerializer,
            403: ProblemeSerializer,
            409: ProblemeSerializer,
        },
    )
    @action(detail=True, methods=["put"])
    def jour(self, request: Request, pk: str) -> Response:
        """Jour de paie de ce mois (#353) : le gérant en brouillon, le propriétaire
        jusqu'au paiement."""
        corps = JourDePaieSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                cas.changer_jour(
                    depots,
                    etat_id=int(pk),
                    jour=corps.validated_data["jour"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(EtatPaieSerializer(self.get_queryset().get(pk=pk)).data)

    @extend_schema(responses=MoisDuCalendrierSerializer(many=True))
    @action(detail=False, pagination_class=None)
    def calendrier(self, request: Request) -> Response:
        """Calendrier des paies : mois préparés, courant et à venir (#353)."""
        return Response(
            MoisDuCalendrierSerializer(
                calendrier(timezone.localdate()),
                many=True,
            ).data,
        )

    @extend_schema(responses=AbsencesProposeesSerializer(many=True))
    @action(detail=True, url_path="absences-proposees")
    def absences_proposees(self, request: Request, pk: str) -> Response:
        """O14 : jours de caisse planifiés et non ouverts, à confirmer ou corriger
        avec PUT /paies/lignes/{ligne}/."""
        etat = self.get_object()
        lignes = LignePaie.objects.select_related("employe").in_bulk(
            list(proposees := absences_du_mois(etat, timezone.localdate())),
        )
        return Response(
            AbsencesProposeesSerializer(
                [
                    {
                        "ligne": pk_ligne,
                        "employe": lignes[pk_ligne].employe.nom,
                        "jours": jours,
                        "saisies": lignes[pk_ligne].absences,
                    }
                    for pk_ligne, jours in proposees.items()
                ],
                many=True,
            ).data,
        )

    @extend_schema(
        request=None,
        responses={200: DemandeDePaieSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"])
    def soumettre(self, request: Request, pk: str) -> Response:
        """Le brouillon part au propriétaire (CdC §5.9) ; une demande est liée."""
        try:
            with transaction.atomic():
                demande = cas.soumettre(
                    depots,
                    etat_id=int(pk),
                    auteur=auteur_de(request),
                    maintenant=timezone.now(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response({"demande": demande})

    @extend_schema(
        request=PayerLigneSerializer,
        parameters=[IDEMPOTENCE],
        responses={201: PaiementSalaireSerializer, 409: ProblemeSerializer},
    )
    @action(
        detail=False,
        methods=["post"],
        url_path=r"lignes/(?P<ligne>\d+)/payer",
        url_name="payer-ligne",
    )
    @idempotent
    def payer_ligne(self, request: Request, ligne: str) -> Response:
        """Un salaire, en partiel si besoin ; une dépense « Salaires » est créée."""
        corps = PayerLigneSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees: dict[str, Any] = corps.validated_data
        try:
            paiement = cas_paiements.payer(
                depots_paiements,
                ligne_id=int(ligne),
                montant=donnees["montant"],
                mode=donnees["mode"],
                reference=donnees["reference"],
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            PaiementSalaireSerializer(
                PaiementSalaire.objects.select_related("paye_par").get(pk=paiement),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=PayerToutSerializer,
        parameters=[IDEMPOTENCE],
        responses={200: SalairesPayesSerializer, 409: ProblemeSerializer},
    )
    @action(detail=True, methods=["post"], url_path="payer-tout")
    @idempotent
    def payer_tout(self, request: Request, pk: str) -> Response:
        """Tous les restes de l'état, d'un seul geste."""
        corps = PayerToutSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        try:
            payes = cas_paiements.payer_tout(
                depots_paiements,
                etat_id=int(pk),
                mode=corps.validated_data["mode"],
                reference=corps.validated_data["reference"],
                auteur=auteur_de(request),
                maintenant=timezone.now(),
            )
        except RefusMetier as refus:
            return probleme(refus)
        return Response({"payes": payes})

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(
        detail=False,
        url_path=r"lignes/(?P<ligne>\d+)/bulletin",
        url_name="bulletin",
    )
    def bulletin(self, request: Request, ligne: str) -> HttpResponse:
        """Le bulletin de paie en PDF."""
        trouvee = LignePaie.objects.select_related("etat", "employe").get(pk=ligne)
        reponse = HttpResponse(
            pdf_bulletin(trouvee),
            content_type="application/pdf",
        )
        reponse["Content-Disposition"] = f'inline; filename="bulletin-{ligne}.pdf"'
        return reponse

    @extend_schema(
        request=ModifierLigneSerializer,
        responses={200: LignePaieSerializer, 409: ProblemeSerializer},
    )
    @action(
        detail=False,
        methods=["put"],
        url_path=r"lignes/(?P<ligne>\d+)",
        url_name="ligne",
    )
    def modifier_ligne(self, request: Request, ligne: str) -> Response:
        """Absences et avances, tant que l'état est en brouillon."""
        corps = ModifierLigneSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees: dict[str, Any] = corps.validated_data
        try:
            with transaction.atomic():
                cas.modifier_ligne(
                    depots,
                    ligne_id=int(ligne),
                    absences=donnees["absences"],
                    avances=donnees["avances"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(LignePaieSerializer(LignePaie.objects.get(pk=ligne)).data)

    @extend_schema(
        request=NouvelElementSerializer,
        responses={201: ElementPaieSerializer, 409: ProblemeSerializer},
    )
    @action(
        detail=False,
        methods=["post"],
        url_path=r"lignes/(?P<ligne>\d+)/elements",
        url_name="ligne-elements",
    )
    def ajouter_element(self, request: Request, ligne: str) -> Response:
        """Gain ou pénalité motivé : description, montant, date et auteur."""
        corps = NouvelElementSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        donnees: dict[str, Any] = corps.validated_data
        try:
            with transaction.atomic():
                element = cas.ajouter_element(
                    depots,
                    ligne_id=int(ligne),
                    genre=GenreElement(donnees["genre"]),
                    description=donnees["description"],
                    montant=donnees["montant"],
                    auteur=auteur_de(request),
                    maintenant=timezone.localtime(),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(
            ElementPaieSerializer(ElementPaie.objects.get(pk=element)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        methods=["put"],
        request=ModifierElementSerializer,
        responses={200: ElementPaieSerializer, 409: ProblemeSerializer},
    )
    @extend_schema(
        methods=["delete"],
        request=None,
        responses={204: None, 409: ProblemeSerializer},
    )
    @action(
        detail=False,
        methods=["put", "delete"],
        url_path=r"elements/(?P<element>\d+)",
        url_name="element",
    )
    def element(self, request: Request, element: str) -> Response:
        """Modifier ou retirer un élément, tant que l'état est en brouillon."""
        try:
            if request.method == "DELETE":
                with transaction.atomic():
                    cas.retirer_element(
                        depots,
                        element_id=int(element),
                        auteur=auteur_de(request),
                    )
                return Response(status=status.HTTP_204_NO_CONTENT)
            corps = ModifierElementSerializer(data=request.data)
            corps.is_valid(raise_exception=True)
            with transaction.atomic():
                cas.modifier_element(
                    depots,
                    element_id=int(element),
                    description=corps.validated_data["description"],
                    montant=corps.validated_data["montant"],
                    auteur=auteur_de(request),
                )
        except RefusMetier as refus:
            return probleme(refus)
        return Response(ElementPaieSerializer(ElementPaie.objects.get(pk=element)).data)
