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
from optiboul.depenses.domain.depenses import AchatCourant
from optiboul.depenses.domain.depenses import PayePar
from optiboul.depenses.domain.depenses import Rattachement
from optiboul.depenses.domain.depenses import StatutDepense
from optiboul.depenses.domain.depenses import dans_la_pre_autorisation
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
    pre_autorisee: bool = False
    demande: str = ""  # DEP au-dessus du seuil : DEM-xxx

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
        pre_autorisation: int | None,
        justificatif: Any,
        auteur: Auteur,
        le: datetime,
    ) -> int: ...

    def pre_autorisation(
        self,
        semaine: int,
        achat_courant: str,
    ) -> tuple[int, int, int] | None:
        """Identifiant, plafond et montant déjà engagé, verrouillés."""
        ...

    def fixer_plafonds(
        self,
        semaine: int,
        plafonds: dict[str, int],
        auteur: int,
    ) -> None:
        """Un plafond par achat courant ; zéro retire la pré-autorisation."""
        ...

    def plafonds(self, semaine: int) -> dict[str, int]: ...

    def verrouiller_soumise(self, depense_id: int) -> DepenseSoumise | None:
        """La dépense en attente d'accord, verrouillée."""
        ...

    def marquer(self, depense_id: int, statut: StatutDepense) -> None: ...

    def modifier(
        self,
        depense_id: int,
        depense: NouvelleDepense,
        *,
        session: Session | None,
        justificatif: Any,
    ) -> None:
        """Remplace les champs modifiables ; un justificatif absent est gardé."""
        ...


@dataclass(frozen=True)
class DepenseSoumise:
    depense: NouvelleDepense
    numero: int
    caisse: int | None
    semaine: int
    auteur: int


class Autorisations(Protocol):
    def demander(
        self,
        depense_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str:
        """Émet la demande « dépense au-dessus du seuil » ; renvoie DEM-xxx."""
        ...

    def retirer(
        self,
        depense_id: int,
        *,
        motif: str,
        auteur: Auteur,
        maintenant: datetime,
    ) -> str | None:
        """Annule la demande en attente de la dépense ; renvoie son DEM-xxx."""
        ...


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
    autorisations: Autorisations


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
    seuil: int | None = None,
    entree_en_stock: bool = True,
) -> EtatDepense:
    """DEP-xxxx rattachée à la semaine ouverte (R1) et à la production, à la semaine
    ou au stock ; un achat en stock crée l'entrée, la caisse paie si choisie.

    Au-delà du seuil (R8) et hors pré-autorisation, la dépense attend l'accord du
    gérant (dépense de la caisse) ou du propriétaire (dépense du gérant) ; caisse et
    stock ne bougent qu'à l'accord."""
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
    pre_autorisation = None
    if depense.achat_courant:
        trouvee = depots.depenses.pre_autorisation(semaine.id, depense.achat_courant)
        if trouvee and dans_la_pre_autorisation(
            trouvee[1],
            trouvee[2],
            depense.montant,
        ):
            pre_autorisation = trouvee[0]
    soumise = (
        seuil is not None and depense.montant >= seuil and pre_autorisation is None
    )
    statut = StatutDepense.EN_ATTENTE if soumise else StatutDepense.VALIDEE
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
        pre_autorisation=pre_autorisation,
        justificatif=justificatif,
        auteur=auteur,
        le=maintenant,
    )
    demande = ""
    if soumise:
        demande = depots.autorisations.demander(
            depense_id,
            motif=f"{numero_affiche(numero)} · {depense.libelle.strip()}",
            auteur=auteur,
            maintenant=maintenant,
        )
    else:
        _mouvementer(
            depots,
            depense=depense,
            depense_id=depense_id,
            numero=numero,
            caisse=caisse,
            semaine=semaine.id,
            auteur=auteur.utilisateur_id,
            entree_en_stock=entree_en_stock,
        )
    etat = EtatDepense(
        depense_id,
        numero,
        statut,
        pre_autorisation is not None,
        demande,
    )
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
                "pre_autorisee": etat.pre_autorisee,
                "demande": demande,
            },
        ),
    )
    return etat


def _mouvementer(  # noqa: PLR0913
    depots: Depots,
    *,
    depense: NouvelleDepense,
    depense_id: int,
    numero: int,
    caisse: int | None,
    semaine: int,
    auteur: int,
    entree_en_stock: bool = True,
) -> None:
    """La caisse paie si choisie ; un achat rattaché au stock entre en stock."""
    if caisse is not None:
        depots.caisses.ajouter_mouvement(
            caisse,
            genre=GenreMouvement.DEPENSE,
            montant=depense.montant,
            auteur=auteur,
            libelle=numero_affiche(numero),
            receveur=None,
        )
    # Le paiement d'une facture : la matière est déjà entrée à la réception.
    if (
        entree_en_stock
        and depense.rattachement is Rattachement.STOCK
        and depense.quantite
    ):
        depots.stock.mouvementer(
            {depense.matiere: depense.quantite},
            sens=Sens.ENTREE,
            genre=GenreMouvementStock.ACHAT,
            source_type="depense",
            source_id=depense_id,
            semaine=semaine,
            auteur=auteur,
            motif=depense.fournisseur.strip(),
        )


def valideurs(profil_emetteur: str) -> tuple[str, ...]:
    """R8 : le gérant valide pour la caisse et la production, le propriétaire pour
    le gérant."""
    return ("proprietaire",) if profil_emetteur == "gerant" else ("gerant",)


def conclure(
    depots: Depots,
    *,
    depense_id: int,
    accord: bool,
    decideur: Auteur,
) -> None:
    """La demande tranchée : accordée, la caisse et le stock bougent ; refusée, rien."""
    soumise = depots.depenses.verrouiller_soumise(depense_id)
    if soumise is None:
        message = "Cette dépense n'attend plus de décision."
        raise RefusMetier("depense_non_en_attente", message)
    if accord:
        if soumise.caisse is not None:
            caisse = depots.caisses.verrouiller(soumise.caisse)
            if caisse is None or not peut_saisir(caisse.statut):
                message = "La caisse de cette dépense est fermée : faites-la rouvrir."
                raise RefusMetier("caisse_fermee", message)
        _mouvementer(
            depots,
            depense=soumise.depense,
            depense_id=depense_id,
            numero=soumise.numero,
            caisse=soumise.caisse,
            semaine=soumise.semaine,
            auteur=soumise.auteur,
        )
    statut = StatutDepense.VALIDEE if accord else StatutDepense.REFUSEE
    depots.depenses.marquer(depense_id, statut)
    depots.journal.enregistrer(
        Evenement(
            action=f"depense.{'validee' if accord else 'refusee'}",
            auteur=decideur,
            objet_type="depense",
            objet_id=str(depense_id),
            avant={"statut": StatutDepense.EN_ATTENTE},
            apres={"statut": statut},
        ),
    )


CORRIGENT_TOUTES = frozenset({"gerant", "proprietaire"})


def _en_attente(depots: Depots, depense_id: int, auteur: Auteur) -> DepenseSoumise:
    """Seule une dépense en attente se corrige, par son auteur ou la direction."""
    soumise = depots.depenses.verrouiller_soumise(depense_id)
    if soumise is None:
        message = "Cette dépense est déjà décidée : elle ne se modifie plus."
        raise RefusMetier("depense_deja_decidee", message)
    if (
        auteur.utilisateur_id != soumise.auteur
        and auteur.profil not in CORRIGENT_TOUTES
    ):
        message = "Seuls son auteur et la direction corrigent cette dépense."
        raise RefusMetier("droit_insuffisant", message)
    return soumise


def modifier(  # noqa: PLR0913
    depots: Depots,
    *,
    depense_id: int,
    depense: NouvelleDepense,
    session_production: Session,
    justificatif: Any,
    seuil: int,
    auteur: Auteur,
    maintenant: datetime,
) -> StatutDepense:
    """Corrige une dépense en attente (#300). Passée sous le seuil, elle n'a plus
    besoin d'accord : la demande est annulée, la caisse et le stock bougent."""
    soumise = _en_attente(depots, depense_id, auteur)
    if depense.paye_par is not soumise.depense.paye_par:
        message = "Le moyen de paiement ne se modifie pas : annulez puis ressaisissez."
        raise RefusMetier("paiement_non_modifiable", message)
    verifier_depense(depense, depots.stock.suivies())
    depots.depenses.modifier(
        depense_id,
        depense,
        session=session_production
        if depense.rattachement is not Rattachement.SEMAINE
        else None,
        justificatif=justificatif,
    )
    statut = StatutDepense.EN_ATTENTE
    if depense.montant < seuil:
        depots.autorisations.retirer(
            depense_id,
            motif="Montant ramené sous le seuil de validation",
            auteur=auteur,
            maintenant=maintenant,
        )
        _mouvementer(
            depots,
            depense=depense,
            depense_id=depense_id,
            numero=soumise.numero,
            caisse=soumise.caisse,
            semaine=soumise.semaine,
            auteur=soumise.auteur,
        )
        statut = StatutDepense.VALIDEE
        depots.depenses.marquer(depense_id, statut)
    depots.journal.enregistrer(
        Evenement(
            action="depense.modifiee",
            auteur=auteur,
            objet_type="depense",
            objet_id=str(depense_id),
            avant={
                "libelle": soumise.depense.libelle,
                "montant": soumise.depense.montant,
                "categorie": soumise.depense.categorie,
                "rattachement": soumise.depense.rattachement,
            },
            apres={
                "libelle": depense.libelle,
                "montant": depense.montant,
                "categorie": depense.categorie,
                "rattachement": depense.rattachement,
                "statut": statut,
            },
        ),
    )
    return statut


def annuler(
    depots: Depots,
    *,
    depense_id: int,
    motif: str,
    auteur: Auteur,
    maintenant: datetime,
) -> None:
    """Retire une dépense en attente (#300). Rien n'a bougé avant l'accord : ni
    caisse ni stock à défaire ; la demande liée est close."""
    if not motif.strip():
        raise RefusMetier("motif_obligatoire", "Le motif est obligatoire.")
    _en_attente(depots, depense_id, auteur)
    depots.depenses.marquer(depense_id, StatutDepense.ANNULEE)
    demande = depots.autorisations.retirer(
        depense_id,
        motif=motif,
        auteur=auteur,
        maintenant=maintenant,
    )
    depots.journal.enregistrer(
        Evenement(
            action="depense.annulee",
            auteur=auteur,
            objet_type="depense",
            objet_id=str(depense_id),
            avant={"statut": StatutDepense.EN_ATTENTE},
            apres={
                "statut": StatutDepense.ANNULEE,
                "motif": motif.strip(),
                "demande": demande or "",
            },
        ),
    )


FIXENT_LES_PRE_AUTORISATIONS = frozenset({"gerant", "proprietaire"})


def fixer_pre_autorisations(
    depots: Depots,
    *,
    plafonds: dict[str, int],
    auteur: Auteur,
) -> dict[str, int]:
    """En début de semaine, un plafond par achat courant (O7) ; dans ce cadre, une
    dépense ne crée pas de demande."""
    if (
        auteur.profil not in FIXENT_LES_PRE_AUTORISATIONS
        or auteur.utilisateur_id is None
    ):
        message = "Seuls le gérant et le propriétaire pré-autorisent les achats."
        raise RefusMetier("droit_insuffisant", message)
    semaine = depots.semaines.ouverte()
    if semaine is None:
        message = "Aucune semaine n'est ouverte (R1)."
        raise RefusMetier("semaine_non_ouverte", message)
    if inconnus := sorted(set(plafonds) - {a.value for a in AchatCourant}):
        message = f"Achats courants inconnus : {', '.join(inconnus)}."
        raise RefusMetier("achat_courant_inconnu", message, achats=inconnus)
    if any(plafond < 0 for plafond in plafonds.values()):
        message = "Un plafond n'est pas négatif."
        raise RefusMetier("montant_invalide", message)
    avant = depots.depenses.plafonds(semaine.id)
    depots.depenses.fixer_plafonds(semaine.id, plafonds, auteur.utilisateur_id)
    apres = depots.depenses.plafonds(semaine.id)
    depots.journal.enregistrer(
        Evenement(
            action="pre_autorisations.fixees",
            auteur=auteur,
            objet_type="semaine",
            objet_id=str(semaine.id),
            avant=avant,
            apres=apres,
        ),
    )
    return apres
