"""Refus métier rendus en { detail, code, … } (RFC 9457, spécification §6.1)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from rest_framework import serializers
from rest_framework import status
from rest_framework.response import Response

if TYPE_CHECKING:
    from optiboul.core.domain.erreurs import RefusMetier

# Codes qui ne sont pas des conflits d'état (409) : saisie invalide ou objet absent.
STATUTS = {
    "confirmation_invalide": status.HTTP_400_BAD_REQUEST,
    "sauvegarde_inconnue": status.HTTP_404_NOT_FOUND,
    "restauration_inconnue": status.HTTP_404_NOT_FOUND,
    "valideur_introuvable": status.HTTP_409_CONFLICT,
    "depense_inconnue": status.HTTP_404_NOT_FOUND,
    "fichier_invalide": status.HTTP_400_BAD_REQUEST,
    "paie_inconnue": status.HTTP_404_NOT_FOUND,
    "element_paie_inconnu": status.HTTP_404_NOT_FOUND,
    "description_obligatoire": status.HTTP_400_BAD_REQUEST,
    "ligne_paie_inconnue": status.HTTP_404_NOT_FOUND,
    "manquant_inconnu": status.HTTP_404_NOT_FOUND,
    "justification_obligatoire": status.HTTP_400_BAD_REQUEST,
    "controle_inconnu": status.HTTP_404_NOT_FOUND,
    "comptage_incomplet": status.HTTP_400_BAD_REQUEST,
    "sens_invalide": status.HTTP_400_BAD_REQUEST,
    "profil_inadapte": status.HTTP_400_BAD_REQUEST,
    "semaine_inconnue": status.HTTP_404_NOT_FOUND,
    "caisse_inconnue": status.HTTP_404_NOT_FOUND,
    "droit_insuffisant": status.HTTP_403_FORBIDDEN,
    "fiche_invalide": status.HTTP_400_BAD_REQUEST,
    "produit_inconnu": status.HTTP_400_BAD_REQUEST,
    "telephone_invalide": status.HTTP_400_BAD_REQUEST,
    "client_inconnu": status.HTTP_404_NOT_FOUND,
    "commande_inconnue": status.HTTP_404_NOT_FOUND,
    "quantite_invalide": status.HTTP_400_BAD_REQUEST,
    "commande_vide": status.HTTP_400_BAD_REQUEST,
    "cle_idempotence_absente": status.HTTP_400_BAD_REQUEST,
    "caisse_d_une_autre": status.HTTP_403_FORBIDDEN,
    "reference_obligatoire": status.HTTP_400_BAD_REQUEST,
    "montant_invalide": status.HTTP_400_BAD_REQUEST,
    "type_demande_inconnu": status.HTTP_400_BAD_REQUEST,
    "demande_inconnue": status.HTTP_404_NOT_FOUND,
    "objet_inconnu": status.HTTP_404_NOT_FOUND,
    "production_inconnue": status.HTTP_404_NOT_FOUND,
    "fournee_inconnue": status.HTTP_404_NOT_FOUND,
    "matiere_inconnue": status.HTTP_400_BAD_REQUEST,
    "supplement_vide": status.HTTP_400_BAD_REQUEST,
    "matiere_hors_fournisseur": status.HTTP_400_BAD_REQUEST,
    "date_passee": status.HTTP_400_BAD_REQUEST,
    "prix_obligatoire": status.HTTP_400_BAD_REQUEST,
    "libelle_obligatoire": status.HTTP_400_BAD_REQUEST,
    "fournisseur_obligatoire": status.HTTP_400_BAD_REQUEST,
    "paiement_invalide": status.HTTP_400_BAD_REQUEST,
    "mode_inconnu": status.HTTP_400_BAD_REQUEST,
    "achat_courant_inconnu": status.HTTP_400_BAD_REQUEST,
    "receveur_invalide": status.HTTP_400_BAD_REQUEST,
    "facture_inconnue": status.HTTP_404_NOT_FOUND,
    "motif_obligatoire": status.HTTP_400_BAD_REQUEST,
    "cle_idempotence_reutilisee": status.HTTP_422_UNPROCESSABLE_ENTITY,
}


class ProblemeSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()


def probleme(refus: RefusMetier) -> Response:
    statut = STATUTS.get(refus.code, status.HTTP_409_CONFLICT)
    return Response(
        {"detail": refus.detail, "code": refus.code, **refus.autres},
        status=statut,
    )
