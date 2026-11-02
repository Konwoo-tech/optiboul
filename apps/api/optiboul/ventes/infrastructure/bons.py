"""Bon de livraison (US-054, CdC §5.3, O15) : PDF et message WhatsApp."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.template.loader import render_to_string
from django.utils import timezone

from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.templatetags.optiboul import fcfa
from optiboul.notifications.domain.envois import Canal
from optiboul.notifications.infrastructure.envois import file_envoi
from optiboul.notifications.infrastructure.models import MessageSortant
from optiboul.ventes.domain.livraisons import StatutLivraison

if TYPE_CHECKING:
    from .models import Livraison

BOULANGERIE = "Boulangerie du Faubourg · Etoudi, Yaoundé"
OBJET = "livraison"


def _recu(livraison: Livraison) -> int:
    return sum(e.montant for e in livraison.encaissements.all())


def texte(livraison: Livraison) -> str:
    """Le bon en quelques lignes, tel qu'il part par WhatsApp."""
    moment = timezone.localtime(livraison.cree_le)
    lignes = [
        BOULANGERIE,
        f"Bon de livraison n° {livraison.numero} du {moment:%d/%m/%Y à %H:%M}",
        f"Client : {livraison.client.nom}",
        "",
        *(
            f"{ligne.produit.code} : {ligne.quantite} à {fcfa(ligne.prix_unitaire)}"
            f" = {fcfa(ligne.montant)}"
            for ligne in livraison.lignes.all()
        ),
        "",
        f"Montant dû : {fcfa(livraison.montant_du)}",
        f"Reçu : {fcfa(_recu(livraison))}",
        f"Solde après livraison : {fcfa(livraison.solde_apres)}",
    ]
    return "\n".join(lignes)


def html(livraison: Livraison) -> str:
    return render_to_string(
        "ventes/bon.html",
        {
            "boulangerie": BOULANGERIE,
            "livraison": livraison,
            "moment": timezone.localtime(livraison.cree_le),
            "lignes": livraison.lignes.select_related("produit"),
            "paiements": livraison.encaissements.all(),
            "recu": _recu(livraison),
        },
    )


def pdf(livraison: Livraison) -> bytes:
    from weasyprint import HTML  # noqa: PLC0415 : bibliothèque lourde, chargée au besoin

    return HTML(string=html(livraison)).write_pdf()


def envoyer_whatsapp(livraison: Livraison) -> MessageSortant:
    """Mis en file : il part au retour du réseau (O15) ; son état reste visible."""
    if livraison.statut != StatutLivraison.LIVREE:
        message = "Seule une livraison faite a un bon à envoyer."
        raise RefusMetier("livraison_non_livree", message)
    if not livraison.client.telephone:
        message = "Ce client n'a pas de numéro : remettez le bon imprimé."
        raise RefusMetier("client_sans_telephone", message)
    message_id = file_envoi.mettre_en_file(
        Canal.WHATSAPP,
        livraison.client.telephone,
        texte(livraison),
        objet_type=OBJET,
        objet_id=livraison.pk,
    )
    return MessageSortant.objects.get(pk=message_id)


def dernier_envoi(livraison_id: int) -> MessageSortant | None:
    return (
        MessageSortant.objects.filter(objet_type=OBJET, objet_id=livraison_id)
        .order_by("-cree_le", "-id")
        .first()
    )
