"""Règles de vente (R6, R19). Python pur : aucune dépendance à Django."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ResultatPlafond:
    autorise: bool
    manque: int  # FCFA à encaisser pour repasser sous le plafond


def verifier_plafond(
    solde_avant: int,
    montant_du: int,
    recu: int,
    plafond: int,
) -> ResultatPlafond:
    """Contrôle le plafond de dette d'un client après une livraison (R6).

    Le solde est négatif quand le client doit de l'argent.
    """
    solde_apres = solde_avant + recu - montant_du
    manque = max(0, -solde_apres - plafond)
    return ResultatPlafond(autorise=manque == 0, manque=manque)
