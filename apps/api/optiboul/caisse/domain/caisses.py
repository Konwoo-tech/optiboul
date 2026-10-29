"""Caisses, sessions de vente (CdC §5.2, R1, R13, R17). Python pur."""

from __future__ import annotations

from datetime import date
from datetime import datetime
from datetime import timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

FUSEAU = ZoneInfo("Africa/Douala")


class StatutCaisse(StrEnum):
    OUVERTE = "ouverte"
    FERMEE = "fermee"
    ROUVERTE = "rouverte"


EN_COURS = frozenset({StatutCaisse.OUVERTE, StatutCaisse.ROUVERTE})


class GenreMouvement(StrEnum):
    ESPECES = "especes"  # espèces encaissées
    DEPENSE = "depense"  # dépense payée par la caisse
    REMISE = "remise"  # remise au coffre ou au gérant (O4)


def creneau_de(instant: datetime) -> tuple[date, str]:
    """Jour de 06:00 à 18:00, nuit ensuite ; avant 06:00, la nuit de la veille."""
    local = instant.astimezone(FUSEAU)
    if local.hour < 6:  # noqa: PLR2004
        return (local - timedelta(days=1)).date(), "nuit"
    if local.hour < 18:  # noqa: PLR2004
        return local.date(), "jour"
    return local.date(), "nuit"


RAISONS_OUVERTURE = {
    "semaine_non_ouverte": "Aucune semaine n'est ouverte (R1).",
    "caisse_deja_ouverte": "Une caisse est déjà ouverte : fermez-la d'abord.",
    "creneau_deja_ferme": "La caisse de ce créneau est fermée : faites-la rouvrir.",
    "fonds_negatif": "Le fonds de caisse ne peut pas être négatif.",
}


def raison_de_ne_pas_ouvrir(
    *,
    semaine_ouverte: bool,
    caisse_en_cours: bool,
    caisse_du_creneau: StatutCaisse | None,
    fonds: int,
) -> str | None:
    """Une caisse par créneau (R17), rattachée à la semaine ouverte (R1)."""
    if not semaine_ouverte:
        return "semaine_non_ouverte"
    if caisse_en_cours:
        return "caisse_deja_ouverte"
    if caisse_du_creneau is not None:
        return "creneau_deja_ferme"
    if fonds < 0:
        return "fonds_negatif"
    return None


def totaux(mouvements: list[tuple[GenreMouvement, int]]) -> dict[GenreMouvement, int]:
    """Espèces encaissées, dépenses et remises de la caisse, en entiers FCFA."""
    sommes = dict.fromkeys(GenreMouvement, 0)
    for genre, montant in mouvements:
        sommes[genre] += montant
    return sommes


def peut_saisir(statut: StatutCaisse) -> bool:
    """La fermeture verrouille toutes les saisies de la caisse (CdC §5.2)."""
    return statut in EN_COURS
