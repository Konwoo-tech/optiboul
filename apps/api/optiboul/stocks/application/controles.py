"""Deux contrôles de stock par semaine, guidés et à l'aveugle (US-093, R9, R16)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.stocks.domain.controles import PorteeControle
from optiboul.stocks.domain.controles import StatutControle
from optiboul.stocks.domain.controles import StatutLigne
from optiboul.stocks.domain.controles import a_soumettre
from optiboul.stocks.domain.controles import date_du_jour
from optiboul.stocks.domain.controles import portee_du_jour
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.semaines import DepotSemaines
    from optiboul.core.application.semaines import EtatSemaine
    from optiboul.notifications.application.ports import Notificateur

    from .stocks import Stock

CONTROLENT = frozenset({"gerant", "production"})
OUVERTS = (StatutControle.PREVU, StatutControle.A_FAIRE)
GENRE = "stock.controle"
LIEN = "/atelier/stocks?onglet=inventaires"


@dataclass(frozen=True)
class EtatControle:
    id: int
    semaine: int
    jour: date
    portee: PorteeControle
    statut: StatutControle


@dataclass(frozen=True)
class LigneSoumise:
    matiere: str
    ecart: Decimal  # compté moins théorique


class DepotControles(Protocol):
    def creer(
        self,
        semaine: EtatSemaine,
        jour: date,
        portee: PorteeControle,
    ) -> None: ...

    def verrouiller(self, controle_id: int) -> EtatControle | None: ...

    def ouverts_du_jour(self, jour: date) -> list[EtatControle]: ...

    def ouverts_avant(self, jour: date) -> list[EtatControle]: ...

    def marquer(self, controle_id: int, statut: StatutControle) -> None: ...

    def matieres(self, portee: PorteeControle) -> list[str]: ...

    def ajouter_ligne(
        self,
        controle_id: int,
        *,
        matiere: str,
        theorique: Decimal,
        compte: Decimal,
        statut: StatutLigne,
    ) -> None: ...

    def terminer(self, controle_id: int, *, auteur: int, le: datetime) -> None: ...

    def lignes_soumises(self, controle_id: int) -> list[LigneSoumise]: ...

    def conclure_lignes(self, controle_id: int, statut: StatutLigne) -> None: ...

    def auteur_de(self, controle_id: int) -> int: ...


class Autorisations(Protocol):
    def demander(
        self,
        controle_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str: ...


@dataclass(frozen=True)
class Depots:
    controles: DepotControles
    stock: Stock
    semaines: DepotSemaines
    journal: Journal
    notificateur: Notificateur
    autorisations: Autorisations


def planifier(depots: Depots, *, jours: list[str]) -> int:
    """Lundi : les contrôles de la semaine ouverte, une seule fois."""
    semaine = depots.semaines.ouverte()
    if semaine is None:
        return 0
    for jour in jours:
        depots.controles.creer(
            semaine,
            date_du_jour(semaine.annee, semaine.numero, jour),
            portee_du_jour(jour),
        )
    return len(jours)


def rappeler(depots: Depots, *, aujourdhui: date) -> int:
    controles = depots.controles.ouverts_du_jour(aujourdhui)
    a_rappeler = [c for c in controles if c.statut is StatutControle.PREVU]
    for controle in a_rappeler:
        depots.controles.marquer(controle.id, StatutControle.A_FAIRE)
    if a_rappeler:
        depots.notificateur.notifier_type(
            GENRE,
            titre="Contrôle de stock à faire aujourd'hui",
            message="Par le gérant de la semaine avec le responsable de production.",
            lien=LIEN,
        )
    return len(a_rappeler)


def marquer_manques(depots: Depots, *, aujourdhui: date) -> int:
    """R16 : non fait la veille, le contrôle est manqué et remonte en alerte."""
    manques = depots.controles.ouverts_avant(aujourdhui)
    for controle in manques:
        depots.controles.marquer(controle.id, StatutControle.MANQUE)
        depots.notificateur.notifier_type(
            GENRE,
            titre=f"Contrôle de stock du {controle.jour:%d/%m} manqué",
            lien=LIEN,
        )
    return len(manques)


def _ouvert_ce_jour(
    depots: Depots,
    controle_id: int,
    auteur: Auteur,
    aujourdhui: date,
) -> EtatControle:
    if auteur.profil not in CONTROLENT or auteur.utilisateur_id is None:
        message = "Le gérant et le responsable de production contrôlent le stock."
        raise RefusMetier("droit_insuffisant", message)
    controle = depots.controles.verrouiller(controle_id)
    if controle is None:
        raise RefusMetier("controle_inconnu", "Ce contrôle n'existe pas.")
    if controle.statut not in OUVERTS:
        raise RefusMetier("controle_clos", "Ce contrôle est clos.")
    if controle.jour != aujourdhui:
        message = f"Ce contrôle se fait le {controle.jour:%d/%m}."
        raise RefusMetier("controle_pas_aujourdhui", message)
    return controle


def commencer(
    depots: Depots,
    *,
    controle_id: int,
    auteur: Auteur,
    aujourdhui: date,
) -> list[str]:
    """La liste à compter, sans stock théorique : le comptage reste à l'aveugle."""
    controle = _ouvert_ce_jour(depots, controle_id, auteur, aujourdhui)
    if controle.statut is StatutControle.PREVU:
        depots.controles.marquer(controle_id, StatutControle.A_FAIRE)
    return depots.controles.matieres(controle.portee)


def _ajuster(  # noqa: PLR0913
    depots: Depots,
    ecarts: dict[str, Decimal],
    *,
    controle_id: int,
    semaine: int,
    auteur: int,
    motif: str,
) -> None:
    for sens, quantites in (
        (Sens.ENTREE, {m: e for m, e in ecarts.items() if e > 0}),
        (Sens.SORTIE, {m: -e for m, e in ecarts.items() if e < 0}),
    ):
        depots.stock.mouvementer(
            quantites,
            sens=sens,
            genre=GenreMouvementStock.INVENTAIRE,
            source_type="controle_stock",
            source_id=controle_id,
            semaine=semaine,
            auteur=auteur,
            motif=motif,
        )


def valider(  # noqa: PLR0913
    depots: Depots,
    *,
    controle_id: int,
    comptes: dict[str, Decimal],
    tolerance: int,
    auteur: Auteur,
    maintenant: datetime,
) -> str | None:
    """Écart dans la tolérance ajusté tout de suite, au-delà soumis au propriétaire.

    Renvoie le numéro de la demande, s'il y en a une.
    """
    controle = _ouvert_ce_jour(depots, controle_id, auteur, maintenant.date())
    attendues = depots.controles.matieres(controle.portee)
    if set(comptes) != set(attendues):
        manquantes = sorted(set(attendues) - set(comptes))
        message = "Comptez toutes les matières de la liste, et elles seules."
        raise RefusMetier("comptage_incomplet", message, manquantes=manquantes)
    if any(compte < 0 for compte in comptes.values()):
        raise RefusMetier("quantite_invalide", "Une quantité comptée est positive.")
    assert auteur.utilisateur_id is not None
    theoriques = depots.stock.quantites()
    tout_de_suite: dict[str, Decimal] = {}
    soumises: list[str] = []
    for matiere in attendues:
        theorique, compte = theoriques[matiere], comptes[matiere]
        soumise = a_soumettre(theorique, compte, tolerance)
        depots.controles.ajouter_ligne(
            controle_id,
            matiere=matiere,
            theorique=theorique,
            compte=compte,
            statut=StatutLigne.SOUMISE if soumise else StatutLigne.AJUSTEE,
        )
        if soumise:
            soumises.append(matiere)
        elif compte != theorique:
            tout_de_suite[matiere] = compte - theorique
    _ajuster(
        depots,
        tout_de_suite,
        controle_id=controle_id,
        semaine=controle.semaine,
        auteur=auteur.utilisateur_id,
        motif="Contrôle de stock",
    )
    depots.controles.terminer(
        controle_id,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="stock.controle_fait",
            auteur=auteur,
            objet_type="controle_stock",
            objet_id=str(controle_id),
            apres={
                "ajustees": {m: str(e) for m, e in tout_de_suite.items()},
                "soumises": soumises,
            },
        ),
    )
    if not soumises:
        return None
    return depots.autorisations.demander(
        controle_id,
        motif=f"Écart de stock au-delà de {tolerance} % : {', '.join(soumises)}",
        auteur=auteur,
        maintenant=maintenant,
    )


def conclure(
    depots: Depots,
    *,
    controle_id: int,
    accord: bool,
    decideur: Auteur,
) -> None:
    """L'accord applique les écarts soumis (R9) ; le refus laisse le stock tel quel."""
    controle = depots.controles.verrouiller(controle_id)
    assert controle is not None
    if accord:
        ecarts = {
            ligne.matiere: ligne.ecart
            for ligne in depots.controles.lignes_soumises(controle_id)
            if ligne.ecart
        }
        _ajuster(
            depots,
            ecarts,
            controle_id=controle_id,
            semaine=controle.semaine,
            auteur=decideur.utilisateur_id or depots.controles.auteur_de(controle_id),
            motif="Contrôle de stock, écart accordé",
        )
    depots.controles.conclure_lignes(
        controle_id,
        StatutLigne.AJUSTEE if accord else StatutLigne.REFUSEE,
    )
