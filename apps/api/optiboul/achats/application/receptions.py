"""Réceptionner depuis la réception planifiée (US-101, CdC §5.7, R11, O12)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.achats.domain.receptions import StatutReception
from optiboul.achats.domain.receptions import ecart
from optiboul.achats.domain.receptions import montant
from optiboul.achats.domain.receptions import montant_farine
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.domain.semaines import bornes
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens

if TYPE_CHECKING:
    from datetime import date
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.semaines import DepotSemaines
    from optiboul.stocks.application.stocks import Stock

RECEPTIONNENT = frozenset({"gerant", "production"})
FARINE = "farine"
DELAI_DE_PAIEMENT = timedelta(days=7)
SEQUENCE_FACTURES = "facture_fournisseur"


@dataclass(frozen=True)
class Planifiee:
    id: int
    fournisseur: int
    matiere: str
    quantite: Decimal
    statut: StatutReception


@dataclass(frozen=True)
class Recue:
    id: int
    facture: int
    montant: int
    ecart: Decimal  # reçu moins prévu


class DepotAchats(Protocol):
    def verrouiller_planifiee(self, planifiee_id: int) -> Planifiee | None: ...

    def facture_de_farine(self, fournisseur: int, semaine: int) -> int | None:
        """La facture de farine de la semaine, verrouillée, si elle existe."""
        ...

    def creer_facture(
        self,
        *,
        numero: int,
        fournisseur: int,
        semaine: int,
        farine: bool,
        echeance: date,
    ) -> int: ...

    def ajouter_a_facture(self, facture_id: int, montant: int) -> None: ...

    def noter_manquant(
        self,
        reception_id: int,
        quantite: Decimal,
        *,
        le: datetime,
    ) -> None: ...

    def solder_manquant_repris(self, planifiee_id: int) -> None:
        """La réception replanifiée est arrivée : le manquant d'origine est livré."""
        ...

    def enregistrer(  # noqa: PLR0913
        self,
        planifiee: Planifiee,
        *,
        semaine: int,
        quantite: Decimal,
        observation: str,
        prix_unitaire: int,
        montant: int,
        facture: int,
        auteur: int,
        le: datetime,
    ) -> int:
        """La réception, et la réception planifiée passe à « reçue »."""
        ...


class Numeros(Protocol):
    def prochain(self, nom: str) -> int: ...


@dataclass(frozen=True)
class Depots:
    achats: DepotAchats
    stock: Stock
    semaines: DepotSemaines
    numeros: Numeros
    journal: Journal


def receptionner(  # noqa: PLR0913
    depots: Depots,
    *,
    planifiee_id: int,
    quantite: Decimal,
    observation: str,
    prix_unitaire: int | None,
    prix_sac_farine: int,
    auteur: Auteur,
    maintenant: datetime,
) -> Recue:
    """La quantité comptée entre en stock et sur la facture ; la farine de la
    semaine s'additionne sur une seule facture, payée le mardi suivant."""
    if auteur.profil not in RECEPTIONNENT or auteur.utilisateur_id is None:
        message = "Seuls le gérant et le responsable de production réceptionnent."
        raise RefusMetier("droit_insuffisant", message)
    semaine = depots.semaines.ouverte()
    if semaine is None:
        message = "Aucune semaine n'est ouverte (R1)."
        raise RefusMetier("semaine_non_ouverte", message)
    planifiee = depots.achats.verrouiller_planifiee(planifiee_id)
    if planifiee is None or planifiee.statut is not StatutReception.PLANIFIEE:
        message = "Cette réception n'est plus attendue."
        raise RefusMetier("reception_close", message)
    if quantite <= 0:
        message = "La quantité comptée est positive."
        raise RefusMetier("quantite_invalide", message)
    if planifiee.matiere == FARINE:
        prix, du = 0, montant_farine(quantite, prix_sac_farine)
        facture = depots.achats.facture_de_farine(planifiee.fournisseur, semaine.id)
        echeance = bornes(semaine.annee, semaine.numero).fin.date() + timedelta(days=1)
    else:
        if not prix_unitaire:
            message = "Indiquez le prix unitaire de cette matière."
            raise RefusMetier("prix_obligatoire", message)
        prix, du, facture = prix_unitaire, montant(quantite, prix_unitaire), None
        echeance = maintenant.date() + DELAI_DE_PAIEMENT
    if facture is None:
        facture = depots.achats.creer_facture(
            numero=depots.numeros.prochain(SEQUENCE_FACTURES),
            fournisseur=planifiee.fournisseur,
            semaine=semaine.id,
            farine=planifiee.matiere == FARINE,
            echeance=echeance,
        )
    depots.achats.ajouter_a_facture(facture, du)
    reception_id = depots.achats.enregistrer(
        planifiee,
        semaine=semaine.id,
        quantite=quantite,
        observation=observation.strip(),
        prix_unitaire=prix,
        montant=du,
        facture=facture,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.stock.mouvementer(
        {planifiee.matiere: quantite},
        sens=Sens.ENTREE,
        genre=GenreMouvementStock.RECEPTION,
        source_type="reception",
        source_id=reception_id,
        semaine=semaine.id,
        auteur=auteur.utilisateur_id,
    )
    difference = ecart(planifiee.quantite, quantite)
    depots.achats.solder_manquant_repris(planifiee.id)
    if difference < 0:
        depots.achats.noter_manquant(reception_id, -difference, le=maintenant)
    depots.journal.enregistrer(
        Evenement(
            action="reception.recue",
            auteur=auteur,
            objet_type="reception",
            objet_id=str(reception_id),
            apres={
                "planifiee": planifiee.id,
                "matiere": planifiee.matiere,
                "prevue": str(planifiee.quantite),
                "recue": str(quantite),
                "ecart": str(difference),
                "facture": facture,
                "montant": du,
            },
        ),
    )
    return Recue(reception_id, facture, du, difference)
