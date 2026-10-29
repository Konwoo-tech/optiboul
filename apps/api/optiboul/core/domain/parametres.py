"""Paramètres métier (CdC §9). Python pur : catalogue, défauts, validation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
_HEURE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class Genre(StrEnum):
    MONTANT = "montant"  # entier FCFA
    ENTIER = "entier"
    POURCENTAGE = "pourcentage"  # entier de 0 à 100
    HEURE = "heure"  # « HH:MM »
    JOUR = "jour"
    JOURS = "jours"  # liste de jours
    CHOIX = "choix"  # entier parmi des valeurs permises


class ValeurInvalide(ValueError):  # noqa: N818
    pass


@dataclass(frozen=True)
class Definition:
    cle: str
    libelle: str
    genre: Genre
    defaut: Any
    unite: str = ""
    usage: str = ""
    minimum: int | None = None
    maximum: int | None = None
    choix: tuple[int, ...] = ()

    def valider(self, valeur: Any) -> Any:  # noqa: C901
        """Renvoie la valeur normalisée, ou lève ValeurInvalide."""
        match self.genre:
            case Genre.MONTANT | Genre.ENTIER | Genre.POURCENTAGE:
                if isinstance(valeur, bool) or not isinstance(valeur, int):
                    message = "Nombre entier attendu."
                    raise ValeurInvalide(message)
                plancher = 0 if self.minimum is None else self.minimum
                plafond = 100 if self.genre is Genre.POURCENTAGE else self.maximum
                if valeur < plancher or (plafond is not None and valeur > plafond):
                    message = f"Valeur attendue entre {plancher} et {plafond or '∞'}."
                    raise ValeurInvalide(message)
                return valeur
            case Genre.CHOIX:
                if valeur not in self.choix or isinstance(valeur, bool):
                    permis = ", ".join(str(c) for c in self.choix)
                    message = f"Valeur permise : {permis}."
                    raise ValeurInvalide(message)
                return valeur
            case Genre.HEURE:
                if not isinstance(valeur, str) or not _HEURE.match(valeur):
                    message = "Heure attendue au format HH:MM."
                    raise ValeurInvalide(message)
                return valeur
            case Genre.JOUR:
                if valeur not in JOURS:
                    message = "Jour de la semaine attendu (lundi… dimanche)."
                    raise ValeurInvalide(message)
                return valeur
            case Genre.JOURS:
                if (
                    not isinstance(valeur, list)
                    or not valeur
                    or any(jour not in JOURS for jour in valeur)
                ):
                    message = "Liste non vide de jours de la semaine attendue."
                    raise ValeurInvalide(message)
                # Ordre de la semaine, sans doublon.
                return [jour for jour in JOURS if jour in valeur]
        message = "Genre de paramètre inconnu."  # pragma: no cover
        raise ValeurInvalide(message)  # pragma: no cover


CATALOGUE: tuple[Definition, ...] = (
    Definition(
        "plafond_dette_client",
        "Plafond de dette par client",
        Genre.MONTANT,
        2_000,
        "FCFA",
        "R6, livraisons",
    ),
    Definition(
        "echeance_dettes",
        "Échéance des dettes",
        Genre.JOUR,
        "dimanche",
        usage="R6, relances",
    ),
    Definition(
        "relances_jours",
        "Jours des relances automatiques",
        Genre.JOURS,
        ["jeudi", "samedi"],
        usage="O11",
    ),
    Definition(
        "relances_heure",
        "Heure des relances automatiques",
        Genre.HEURE,
        "10:00",
        usage="O11",
    ),
    Definition(
        "fonds_caisse",
        "Fonds de caisse",
        Genre.MONTANT,
        20_000,
        "FCFA",
        "Ouverture de caisse",
    ),
    Definition(
        "plafond_especes",
        "Plafond d'espèces en caisse",
        Genre.MONTANT,
        100_000,
        "FCFA",
        "R18",
    ),
    Definition(
        "seuil_validation_depenses",
        "Seuil de validation des dépenses",
        Genre.MONTANT,
        50_000,
        "FCFA",
        "R8",
    ),
    Definition(
        "seuil_budget_surveiller",
        "Seuil « à surveiller » du budget",
        Genre.POURCENTAGE,
        80,
        "%",
        "Budget",
    ),
    Definition(
        "ecart_matiere_kg_par_sac",
        "Écart matière toléré par sac",
        Genre.ENTIER,
        2,
        "kg",
        "R10",
    ),
    Definition(
        "ecart_matiere_grammes",
        "Écart matière toléré pour les intrants en grammes",
        Genre.POURCENTAGE,
        4,
        "%",
        "R10",
    ),
    Definition(
        "tolerance_inventaire",
        "Tolérance d'inventaire",
        Genre.POURCENTAGE,
        5,
        "%",
        "R9",
    ),
    Definition(
        "tolerance_validation_plan",
        "Tolérance de validation automatique du plan",
        Genre.POURCENTAGE,
        10,
        "% de la moyenne des 4 dernières sessions",
        "R4",
    ),
    Definition(
        "heure_limite_commandes_nuit",
        "Heure limite des commandes (nuit)",
        Genre.HEURE,
        "18:30",
        usage="Production",
    ),
    Definition(
        "heure_limite_commandes_jour",
        "Heure limite des commandes (jour)",
        Genre.HEURE,
        "05:30",
        usage="Production",
    ),
    Definition(
        "echeance_demande_plafond",
        "Échéance d'une demande de plafond",
        Genre.ENTIER,
        10,
        "minutes",
        "R19",
        minimum=1,
    ),
    Definition(
        "inactivite_comptoir",
        "Inactivité avant déconnexion au comptoir",
        Genre.CHOIX,
        5,
        "minutes",
        "Sécurité",
        choix=(1, 5, 10, 15),
    ),
    Definition(
        "sauvegarde_locale",
        "Intervalle de la sauvegarde locale",
        Genre.ENTIER,
        4,
        "heures (et à chaque clôture)",
        "Administration",
        minimum=1,
        maximum=24,
    ),
    Definition(
        "alerte_sauvegarde_cloud",
        "Alerte sans copie cloud",
        Genre.ENTIER,
        48,
        "heures",
        "Administration",
        minimum=1,
    ),
    Definition(
        "prix_sac_farine",
        "Prix du sac de farine",
        Genre.MONTANT,
        19_525,
        "FCFA",
        "Factures, coûts",
    ),
    Definition(
        "demande_estimee_sessions",
        "Demande estimée : sessions du même type",
        Genre.ENTIER,
        4,
        "sessions",
        "Plan de production",
        minimum=1,
    ),
    Definition(
        "supplement_auto_sacs",
        "Supplément accordé automatiquement (sacs par produit)",
        Genre.ENTIER,
        1,
        "sac",
        "O17, R15",
    ),
    Definition(
        "supplement_auto_pourcentage",
        "Supplément accordé automatiquement (part du plan)",
        Genre.POURCENTAGE,
        10,
        "%",
        "O17, R15",
    ),
    Definition(
        "rappel_clients_habituels",
        "Rappel aux clients habituels avant l'heure limite",
        Genre.ENTIER,
        30,
        "minutes",
        "O18",
    ),
    Definition(
        "controles_stock_jours",
        "Jours des contrôles de stock",
        Genre.JOURS,
        ["mercredi", "dimanche"],
        usage="R16",
    ),
)

PAR_CLE: dict[str, Definition] = {
    definition.cle: definition for definition in CATALOGUE
}


def definition(cle: str) -> Definition:
    try:
        return PAR_CLE[cle]
    except KeyError:
        message = f"Paramètre inconnu : {cle}."
        raise ValeurInvalide(message) from None
