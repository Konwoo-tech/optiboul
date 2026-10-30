"""Accueil selon le profil (CdC §5.11, O10). Python pur."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import timedelta

ECRANS = {
    "caissier": "ma_caisse",
    "production": "plan_du_jour",
    "gerant": "ma_semaine",
    "proprietaire": "tableau_de_bord",
    "administrateur": "administration",
}

JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


@dataclass(frozen=True)
class Tache:
    cle: str
    libelle: str
    jour: date
    faite: bool
    lien: str


def jour_de(lundi: date, nom: str) -> date:
    return lundi + timedelta(days=JOURS.index(nom))


def _tache(cle: str, libelle: str, jour: date, lien: str, *, faite: bool) -> Tache:
    return Tache(cle=cle, libelle=libelle, jour=jour, faite=faite, lien=lien)


def taches_de_la_semaine(  # noqa: PLR0913
    *,
    lundi: date,
    plan_a_valider: bool,
    farine_a_payer: bool,
    jours_controle_stock: list[str],
    jours_relance: list[str],
    dettes_clients: bool,
    semaine_cloturee: bool,
) -> list[Tache]:
    """« Ma semaine » du gérant (CdC §5.11) : tâches datées issues des règles."""
    taches = [
        _tache(
            "valider_plan",
            "Valider le plan de production",
            lundi,
            "/atelier/production",
            faite=not plan_a_valider,
        ),
        _tache(
            "payer_farine",
            "Payer la farine de la semaine passée",
            jour_de(lundi, "mardi"),
            "/gestion/fournisseurs",
            faite=not farine_a_payer,
        ),
    ]
    taches += [
        _tache(
            f"controle_stock_{jour}",
            f"Contrôle de stock du {jour}",
            jour_de(lundi, jour),
            "/atelier/stocks",
            faite=False,
        )
        for jour in jours_controle_stock
    ]
    taches += [
        _tache(
            f"relancer_dettes_{jour}",
            f"Relancer les dettes ({jour})",
            jour_de(lundi, jour),
            "/gestion/clients",
            faite=not dettes_clients,
        )
        for jour in jours_relance
    ]
    taches.append(
        _tache(
            "cloturer_semaine",
            "Clôturer la semaine",
            jour_de(lundi, "dimanche"),
            "/gestion/semaines",
            faite=semaine_cloturee,
        ),
    )
    return sorted(taches, key=lambda tache: tache.jour)
