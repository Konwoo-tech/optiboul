"""Règles de caisse (R15, R16). Python pur : aucune dépendance à Django."""

from dataclasses import dataclass
from enum import StrEnum


class StatutEcart(StrEnum):
    JUSTE = "JUSTE"
    MANQUE = "MANQUE"
    EXCEDENT = "EXCEDENT"


@dataclass(frozen=True)
class ResultatFermeture:
    attendu: int
    compte: int
    ecart: int
    statut: StatutEcart


def attendu_en_caisse(fonds: int, especes: int, depenses: int, remises: int) -> int:
    """Espèces attendues : fonds + espèces encaissées - dépenses - remises au coffre."""
    return fonds + especes - depenses - remises


def ecart_caisse(
    fonds: int,
    especes: int,
    depenses: int,
    remises: int,
    compte: int,
) -> ResultatFermeture:
    """Calcule l'écart d'une fermeture de caisse à partir d'un seul comptage (R15)."""
    attendu = attendu_en_caisse(fonds, especes, depenses, remises)
    ecart = compte - attendu
    if ecart == 0:
        statut = StatutEcart.JUSTE
    elif ecart < 0:
        statut = StatutEcart.MANQUE
    else:
        statut = StatutEcart.EXCEDENT
    return ResultatFermeture(attendu=attendu, compte=compte, ecart=ecart, statut=statut)


def remise_coffre_proposee(especes_en_caisse: int, plafond_especes: int) -> bool:
    """Une remise au coffre est proposée au-delà du plafond d'espèces (R16)."""
    return especes_en_caisse > plafond_especes
