"""Accueil selon le profil (US-130, CdC §5.11, O10) : chacun arrive sur sa tâche."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.db.models import Sum
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.response import Response

from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.caisse.application import caisses as cas_caisses
from optiboul.caisse.infrastructure.caisses import depots as depots_caisses
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.infrastructure.cloture import debiteurs
from optiboul.core.api.permissions import TOUS_LES_PROFILS
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.api.permissions import profil_de
from optiboul.core.domain.semaines import bornes
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.demandes.infrastructure.models import Demande
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.production.domain.plan import session_de_production
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.rapports.domain.accueil import ECRANS
from optiboul.rapports.domain.accueil import taches_de_la_semaine
from optiboul.ventes.infrastructure.commandes import limites
from optiboul.ventes.infrastructure.models import Encaissement

if TYPE_CHECKING:
    from rest_framework.request import Request


class AccueilSerializer(serializers.Serializer):
    profil = serializers.CharField()
    ecran = serializers.ChoiceField(choices=sorted(ECRANS.values()))
    contenu = serializers.DictField(help_text="Ce que l'écran d'arrivée affiche.")


def _ma_caisse(request: Request) -> dict[str, Any]:
    caisse = Caisse.objects.filter(en_cours=True, caissiere_id=request.user.pk).first()
    prochaine = cas_caisses.prochaine(depots_caisses, timezone.now())
    return {
        "caisse": {
            "id": caisse.pk,
            "jour": caisse.jour,
            "creneau": caisse.creneau,
            "attendu": cas_caisses.especes(depots_caisses, caisse.pk).attendu,
        }
        if caisse
        else None,
        "prochaine": {
            "jour": prochaine.jour,
            "creneau": prochaine.creneau,
            "planifiee_pour_moi": prochaine.planifiee == request.user.pk,
        },
        "demandes_en_attente": Demande.objects.filter(
            emetteur_id=request.user.pk,
            statut="en_attente",
        ).count(),
    }


def _plan_du_jour() -> dict[str, Any]:
    session = session_de_production(timezone.now(), limites())
    plan = PlanProduction.objects.filter(
        jour=session.jour,
        creneau=session.creneau,
    ).first()
    production = getattr(plan, "production", None) if plan else None
    return {
        "jour": session.jour,
        "creneau": session.creneau,
        "plan": plan.statut if plan else None,
        "sacs": plan.lignes.aggregate(total=Sum("sacs"))["total"] or 0 if plan else 0,
        "production": production.statut if production else None,
    }


def _ma_semaine() -> dict[str, Any]:
    semaine = depot_semaines.ouverte()
    if semaine is None:
        return {"semaine": None, "taches": []}
    lundi = bornes(semaine.annee, semaine.numero).debut.date()
    session = session_de_production(timezone.now(), limites())
    taches = taches_de_la_semaine(
        lundi=lundi,
        plan_a_valider=PlanProduction.objects.filter(
            jour=session.jour,
            creneau=session.creneau,
            statut="propose",
        ).exists(),
        farine_a_payer=FactureFournisseur.objects.filter(farine=True)
        .exclude(statut="payee")
        .exists(),
        jours_controle_stock=parametre("controles_stock_jours"),
        jours_relance=parametre("relances_jours"),
        dettes_clients=bool(debiteurs()),
        semaine_cloturee=False,
    )
    return {"semaine": semaine.id, "taches": [vars(tache) for tache in taches]}


def _tableau_de_bord() -> dict[str, Any]:
    semaine = depot_semaines.ouverte()
    recette = (
        Encaissement.objects.filter(semaine_id=semaine.id).aggregate(
            total=Sum("montant"),
        )["total"]
        or 0
        if semaine
        else 0
    )
    return {
        "demandes_en_attente": Demande.objects.filter(statut="en_attente").count(),
        "recette_semaine": recette,
        "dettes_clients": -sum(solde for _, solde in debiteurs()),
    }


def _administration() -> dict[str, Any]:
    derniere = Sauvegarde.objects.filter(statut="reussie").order_by("-debut").first()
    return {
        "derniere_sauvegarde": derniere.debut if derniere else None,
        "envois_en_attente": MessageSortant.objects.filter(statut="en_attente").count(),
        "envois_en_echec": MessageSortant.objects.filter(statut="echec").count(),
    }


@extend_schema(responses=AccueilSerializer)
@api_view(["GET"])
@permission_classes([ProfilParmi(*TOUS_LES_PROFILS)])
def accueil(request: Request) -> Response:
    """L'écran d'arrivée du profil et son contenu (O10)."""
    profil = profil_de(request) or ""
    contenus = {
        "caissier": lambda: _ma_caisse(request),
        "production": _plan_du_jour,
        "gerant": _ma_semaine,
        "proprietaire": _tableau_de_bord,
        "administrateur": _administration,
    }
    return Response(
        AccueilSerializer(
            {"profil": profil, "ecran": ECRANS[profil], "contenu": contenus[profil]()},
        ).data,
    )
