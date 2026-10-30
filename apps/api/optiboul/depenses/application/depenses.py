"""Cas d'usage des dépenses (US-110, CdC §5.8, R1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Any
from typing import Protocol

from optiboul.caisse.domain.caisses import GenreMouvement
from optiboul.caisse.domain.caisses import peut_saisir
from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.domain.depenses import StatutDepense
from optiboul.depenses.domain.depenses import numero_affiche
from optiboul.depenses.domain.depenses import verifier_depense
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens

if TYPE_CHECKING:
    from datetime import datetime

    from optiboul.caisse.application.caisses import DepotCaisses
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.journal import Journal
    from optiboul.core.application.semaines import DepotSemaines
    from optiboul.depenses.domain.depenses import NouvelleDepense
    from optiboul.stocks.application.stocks import Stock
    from optiboul.ventes.domain.commandes import Session

# CdC §3.3 : la caisse, le gérant et le responsable de production (pour la
# production) saisissent ; le gérant et le propriétaire valident (US-112).
SAISISSENT = frozenset({"caissier", "gerant", "production"})
SEQUENCE_DEPENSES = "depense"


@dataclass(frozen=True)
class EtatDepense:
    id: int
    numero: int
    statut: StatutDepense

    @property
    def code(self) -> str:
        return numero_affiche(self.numero)


class DepotDepenses(Protocol):
    def creer(  # noqa: PLR0913
        self,
        *,
        numero: int,
        semaine: int,
        depense: NouvelleDepense,
        caisse: int | None,
        session: Session | None,
        statut: StatutDepense,
        justificatif: Any,
        auteur: Auteur,
        le: datetime,
    ) -> int: ...


class Numeros(Protocol):
    def prochain(self, nom: str) -> int: ...


@dataclass(frozen=True)
class Depots:
    depenses: DepotDepenses
    caisses: DepotCaisses
    stock: Stock
    semaines: DepotSemaines
    numeros: Numeros
    journal: Journal


def _caisse_qui_paie(depots: Depots, auteur: Auteur) -> int:
    """Payée par la caisse : la caisse en cours, celle de la caissière (CdC §5.2)."""
    en_cours = depots.caisses.en_cours()
    caisse = depots.caisses.verrouiller(en_cours.id) if en_cours else None
    if caisse is None or not peut_saisir(caisse.statut):
        message = "Aucune caisse n'est ouverte pour payer cette dépense."
        raise RefusMetier("aucune_caisse_ouverte", message)
    if auteur.profil == "caissier" and caisse.caissiere != auteur.utilisateur_id:
        message = "La caisse en cours est celle d'une autre caissière."
        raise RefusMetier("caisse_d_une_autre", message)
    return caisse.id


def saisir(  # noqa: PLR0913
    depots: Depots,
    *,
    depense: NouvelleDepense,
    session_production: Session,
    justificatif: Any,
    auteur: Auteur,
    maintenant: datetime,
    statut: StatutDepense = StatutDepense.VALIDEE,
) -> EtatDepense:
    """DEP-xxxx rattachée à la semaine ouverte (R1) et à la production, à la semaine
    ou au stock ; un achat en stock crée l'entrée, la caisse paie si choisie."""
    if auteur.profil not in SAISISSENT or auteur.utilisateur_id is None:
        message = "Votre profil ne saisit pas de dépense."
        raise RefusMetier("droit_insuffisant", message)
    if auteur.profil == "production" and depense.rattachement is Rattachement.SEMAINE:
        message = "Le responsable de production saisit les dépenses de la production."
        raise RefusMetier("droit_insuffisant", message)
    verifier_depense(depense, depots.stock.suivies())
    semaine = depots.semaines.ouverte()
    if semaine is None:
        message = "Aucune semaine n'est ouverte (R1)."
        raise RefusMetier("semaine_non_ouverte", message)
    caisse = (
        _caisse_qui_paie(depots, auteur) if depense.paye_par is PayePar.CAISSE else None
    )
    numero = depots.numeros.prochain(SEQUENCE_DEPENSES)
    depense_id = depots.depenses.creer(
        numero=numero,
        semaine=semaine.id,
        depense=depense,
        caisse=caisse,
        session=session_production
        if depense.rattachement is not Rattachement.SEMAINE
        else None,
        statut=statut,
        justificatif=justificatif,
        auteur=auteur,
        le=maintenant,
    )
    if caisse is not None:
        depots.caisses.ajouter_mouvement(
            caisse,
            genre=GenreMouvement.DEPENSE,
            montant=depense.montant,
            auteur=auteur.utilisateur_id,
            libelle=numero_affiche(numero),
            receveur=None,
        )
    if depense.rattachement is Rattachement.STOCK and depense.quantite:
        depots.stock.mouvementer(
            {depense.matiere: depense.quantite},
            sens=Sens.ENTREE,
            genre=GenreMouvementStock.ACHAT,
            source_type="depense",
            source_id=depense_id,
            semaine=semaine.id,
            auteur=auteur.utilisateur_id,
            motif=depense.fournisseur.strip(),
        )
    etat = EtatDepense(depense_id, numero, statut)
    depots.journal.enregistrer(
        Evenement(
            action="depense.saisie",
            auteur=auteur,
            objet_type="depense",
            objet_id=str(depense_id),
            apres={
                "numero": etat.code,
                "categorie": depense.categorie,
                "montant": depense.montant,
                "paye_par": depense.paye_par,
                "rattachement": depense.rattachement,
                "statut": statut,
            },
        ),
    )
    return etat
