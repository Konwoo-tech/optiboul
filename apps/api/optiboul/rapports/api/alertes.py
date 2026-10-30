"""Alertes cliquables jusqu'au détail (US-132, CdC §5.11)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.response import Response

from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import Manquant
from optiboul.caisse.infrastructure.models import Caisse
from optiboul.clients.domain.clients import StatutDette
from optiboul.clients.domain.clients import plafond_du_client
from optiboul.clients.domain.clients import statut_dette
from optiboul.clients.infrastructure.cloture import debiteurs
from optiboul.core.api.permissions import DIRECTION
from optiboul.core.api.permissions import ProfilParmi
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.demandes.infrastructure.models import Demande
from optiboul.depenses.api.budgets import budget_du_mois
from optiboul.production.application import plans as cas_plans
from optiboul.production.domain.plan import session_de_production
from optiboul.production.domain.production import consommation_theorique
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.models import Production
from optiboul.production.infrastructure.plans import depots as depots_plans
from optiboul.production.infrastructure.plans import nombre_de_sessions
from optiboul.production.infrastructure.productions import etat as etat_production
from optiboul.stocks.infrastructure.etat import etat_du_stock
from optiboul.stocks.infrastructure.models import ControleStock
from optiboul.ventes.infrastructure.commandes import limites

if TYPE_CHECKING:
    from rest_framework.request import Request

NIVEAUX = ("bloquant", "surveiller")


class AlerteSerializer(serializers.Serializer):
    type = serializers.CharField()
    niveau = serializers.ChoiceField(choices=list(NIVEAUX))
    titre = serializers.CharField()
    detail = serializers.CharField()
    nombre = serializers.IntegerField()
    lien = serializers.CharField(help_text="Écran du détail à ouvrir.")


def _alerte(  # noqa: PLR0913, PLR0917
    type_: str,
    niveau: str,
    titre: str,
    detail: str,
    nombre: int,
    lien: str,
) -> dict[str, Any]:
    return {
        "type": type_,
        "niveau": niveau,
        "titre": titre,
        "detail": detail,
        "nombre": nombre,
        "lien": lien,
    }


def _factures_en_retard() -> list[dict[str, Any]]:
    factures = list(
        FactureFournisseur.objects.exclude(statut="payee")
        .filter(echeance__lt=timezone.localdate())
        .select_related("fournisseur"),
    )
    if not factures:
        return []
    noms = ", ".join(sorted({f.fournisseur.nom for f in factures}))
    lien = (
        f"/gestion/fournisseurs/factures/{factures[0].pk}"
        if len(factures) == 1
        else ("/gestion/fournisseurs/factures?statut=en_retard")
    )
    return [
        _alerte(
            "factures_en_retard",
            "bloquant",
            "Factures en retard",
            noms,
            len(factures),
            lien,
        ),
    ]


def _stock_bas() -> list[dict[str, Any]]:
    bas = [ligne.nom for ligne in etat_du_stock() if ligne.statut == "stock_bas"]
    if not bas:
        return []
    return [
        _alerte(
            "stock_bas",
            "bloquant",
            "Stock bas",
            ", ".join(bas),
            len(bas),
            "/atelier/stocks",
        ),
    ]


def _plafonds_depasses() -> list[dict[str, Any]]:
    general = parametre("plafond_dette_client")
    clients = [
        client
        for client, solde in debiteurs()
        if statut_dette(solde, plafond_du_client(client.plafond, general))
        is StatutDette.PLAFOND_DEPASSE
    ]
    if not clients:
        return []
    return [
        _alerte(
            "plafonds_depasses",
            "surveiller",
            "Plafonds de dette dépassés",
            ", ".join(c.nom for c in clients),
            len(clients),
            "/gestion/clients?statut=plafond_depasse",
        ),
    ]


def _budget_depasse() -> list[dict[str, Any]]:
    budget = budget_du_mois(timezone.localdate().replace(day=1))
    depasses = [ligne for ligne in budget["lignes"] if ligne["statut"] == "depasse"]
    if not depasses:
        return []
    return [
        _alerte(
            "budget_depasse",
            "surveiller",
            "Budget dépassé",
            ", ".join(ligne["libelle"] for ligne in depasses),
            len(depasses),
            "/gestion/depenses/budget",
        ),
    ]


def _productions() -> list[dict[str, Any]]:
    semaine = depot_semaines.ouverte()
    if semaine is None:
        return []
    non_cloturees = Production.objects.filter(statut="non_cloturee").count()
    provisoires = PlanProduction.objects.filter(
        semaine_id=semaine.id,
        statut="provisoire",
    ).count()
    nombre = non_cloturees + provisoires
    if not nombre:
        return []
    return [
        _alerte(
            "production_non_cloturee_ou_provisoire",
            "surveiller",
            "Production non clôturée ou provisoire",
            f"{non_cloturees} non clôturée(s), {provisoires} provisoire(s)",
            nombre,
            "/atelier/production",
        ),
    ]


def _manquants() -> list[dict[str, Any]]:
    manquants = Manquant.objects.exclude(statut="livre").count()
    if not manquants:
        return []
    return [
        _alerte(
            "manquants_fournisseurs",
            "surveiller",
            "Manquants fournisseurs",
            "Livraisons reçues en dessous du prévu",
            manquants,
            "/gestion/fournisseurs",
        ),
    ]


def _manques_de_caisse() -> list[dict[str, Any]]:
    semaine = depot_semaines.ouverte()
    if semaine is None:
        return []
    manques = list(Caisse.objects.filter(semaine_id=semaine.id, ecart__lt=0))
    if not manques:
        return []
    total = -sum(caisse.ecart or 0 for caisse in manques)
    return [
        _alerte(
            "manques_de_caisse",
            "surveiller",
            "Manques de caisse",
            f"{total} FCFA sur la semaine",
            len(manques),
            "/comptoir/caisses",
        ),
    ]


def _demandes() -> list[dict[str, Any]]:
    nombre = Demande.objects.filter(statut="en_attente").count()
    if not nombre:
        return []
    return [
        _alerte(
            "demandes_en_attente",
            "surveiller",
            "Demandes en attente",
            f"{nombre} demande(s) à trancher",
            nombre,
            "/gestion/demandes",
        ),
    ]


def _ecarts_matiere() -> list[dict[str, Any]]:
    """R10 : farine consommée au-delà de 2 kg par sac (paramètre) de la théorie."""
    semaine = depot_semaines.ouverte()
    if semaine is None:
        return []
    tolerance = Decimal(parametre("ecart_matiere_kg_par_sac"))
    en_ecart = []
    for production in Production.objects.filter(
        semaine_id=semaine.id,
        statut="cloturee",
    ).select_related("plan"):
        etat = etat_production(production)
        sacs = sum(etat.sacs.values())
        theorique = consommation_theorique(etat.sacs, etat.recettes).get("farine", 0)
        reelle = etat.consommation.get("farine")
        if reelle is not None and abs(reelle - theorique) > tolerance * sacs:
            plan = production.plan
            en_ecart.append(f"{plan.creneau} du {plan.jour:%d/%m}")
    if not en_ecart:
        return []
    return [
        _alerte(
            "ecarts_matiere",
            "surveiller",
            "Écarts matière",
            ", ".join(en_ecart),
            len(en_ecart),
            "/atelier/production",
        ),
    ]


def _controles_manques() -> list[dict[str, Any]]:
    """R16 : un contrôle de stock manqué remonte en alerte."""
    semaine = depot_semaines.ouverte()
    if semaine is None:
        return []
    manques = list(ControleStock.objects.filter(semaine_id=semaine.id, statut="manque"))
    if not manques:
        return []
    return [
        _alerte(
            "controle_stock_manque",
            "bloquant",
            "Contrôle de stock manqué",
            ", ".join(f"{controle.jour:%d/%m}" for controle in manques),
            len(manques),
            "/atelier/stocks/controles",
        ),
    ]


def _demande_estimee() -> list[dict[str, Any]]:
    session = session_de_production(timezone.now(), limites())
    plan = cas_plans.calculer(
        depots_plans,
        session=session,
        nombre=nombre_de_sessions(),
    )
    if not plan.alerte or plan.enregistre is None:
        return []
    produits = [item.code for item in plan.lignes if item.au_dessus_du_plan]
    return [
        _alerte(
            "demande_estimee_superieure",
            "surveiller",
            "Demande estimée au-dessus du plan",
            ", ".join(produits),
            len(produits),
            "/atelier/production",
        ),
    ]


def _sauvegarde_cloud() -> list[dict[str, Any]]:
    derniere = (
        Sauvegarde.objects.filter(genre="cloud", statut="reussie")
        .order_by("-debut")
        .first()
    )
    delai = timedelta(hours=parametre("alerte_sauvegarde_cloud"))
    if derniere is not None and timezone.now() - derniere.debut < delai:
        return []
    return [
        _alerte(
            "sauvegarde_cloud_en_retard",
            "bloquant",
            "Sauvegarde cloud en retard",
            "Aucune copie cloud récente",
            1,
            "/gestion/sauvegardes",
        ),
    ]


SOURCES = (
    _factures_en_retard,
    _stock_bas,
    _plafonds_depasses,
    _budget_depasse,
    _productions,
    _manquants,
    _manques_de_caisse,
    _demandes,
    _ecarts_matiere,
    _controles_manques,
    _demande_estimee,
    _sauvegarde_cloud,
)


@extend_schema(responses=AlerteSerializer(many=True))
@api_view(["GET"])
@permission_classes([ProfilParmi(*DIRECTION)])
def alertes(request: Request) -> Response:
    """Alertes du CdC §5.11, les bloquantes d'abord ; chacune ouvre son détail."""
    trouvees = [alerte for source in SOURCES for alerte in source()]
    trouvees.sort(key=lambda alerte: NIVEAUX.index(alerte["niveau"]))
    return Response(AlerteSerializer(trouvees, many=True).data)
