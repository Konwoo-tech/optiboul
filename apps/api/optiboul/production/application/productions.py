"""Cas d'usage de la production d'une session (US-083, CdC §5.5, R5)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from typing import Protocol

from optiboul.core.application.journal import Evenement
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.production.domain.plan import VALIDES
from optiboul.production.domain.production import RAISONS_CLOTURE
from optiboul.production.domain.production import StatutProduction
from optiboul.production.domain.production import raisons_de_ne_pas_cloturer

from .plans import responsable_de

if TYPE_CHECKING:
    from datetime import datetime
    from decimal import Decimal

    from optiboul.core.application.journal import Auteur
    from optiboul.ventes.domain.commandes import Session

    from .plans import Depots as DepotsPlans


@dataclass(frozen=True)
class EtatProduction:
    id: int
    semaine: int
    session: Session
    statut: StatutProduction
    sacs: dict[str, int]  # produits du plan
    prevus: dict[str, int]
    realise: dict[str, int]
    consommation: dict[str, Decimal]
    recettes: dict[
        str,
        dict[str, Decimal],
    ]  # produit → recette d'un sac (version du plan)
    matieres: set[str]  # matières suivies en stock de ces recettes


class DepotProductions(Protocol):
    def de_la_session(self, session: Session) -> EtatProduction | None: ...

    def verrouiller(self, production_id: int) -> EtatProduction | None: ...

    def ouvrir(
        self,
        plan_id: int,
        *,
        semaine: int,
        auteur: int,
        le: datetime,
    ) -> int: ...

    def ajouter_fournee(
        self,
        production_id: int,
        *,
        code: str,
        pains: int,
        auteur: int,
        le: datetime,
    ) -> None: ...

    def consommer(
        self,
        production_id: int,
        quantites: dict[str, Decimal],
        *,
        auteur: int,
        le: datetime,
    ) -> None: ...

    def cloturer(self, production_id: int, *, auteur: int, le: datetime) -> None: ...

    def matieres_connues(self) -> set[str]: ...


@dataclass(frozen=True)
class Depots:
    productions: DepotProductions
    plans: DepotsPlans


def ouvrir(
    depots: Depots,
    *,
    session: Session,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatProduction:
    """Le responsable de production ouvre, sur un plan validé ou provisoire (R4)."""
    semaine = responsable_de(depots.plans, auteur)
    plan = depots.plans.plans.obtenir(session)
    if plan is None or plan.statut not in VALIDES:
        message = "Le plan de cette session n'est ni validé ni provisoire."
        raise RefusMetier("plan_non_valide", message)
    if depots.productions.de_la_session(session) is not None:
        message = "La production de cette session est déjà ouverte."
        raise RefusMetier("production_deja_ouverte", message)
    assert auteur.utilisateur_id is not None
    production_id = depots.productions.ouvrir(
        plan.id,
        semaine=semaine.id,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.plans.journal.enregistrer(
        Evenement(
            action="production.ouverte",
            auteur=auteur,
            objet_type="production",
            objet_id=str(production_id),
            apres={
                "jour": session.jour.isoformat(),
                "creneau": session.creneau,
                "plan": plan.statut,
            },
        ),
    )
    depots.plans.notificateur.notifier_type(
        "production.ouverte",
        titre=f"Production de {session.creneau} du {session.jour:%d/%m} ouverte",
        message=f"Par {auteur.nom}, plan {plan.statut}.",
        lien="/atelier/production",
    )
    production = depots.productions.de_la_session(session)
    assert production is not None
    return production


def _en_cours(depots: Depots, production_id: int, auteur: Auteur) -> EtatProduction:
    responsable_de(depots.plans, auteur)
    production = depots.productions.verrouiller(production_id)
    if production is None:
        message = "Production inconnue."
        raise RefusMetier("production_inconnue", message)
    if production.statut is not StatutProduction.EN_COURS:
        message = "Cette production est clôturée : plus de saisie."
        raise RefusMetier("production_cloturee", message)
    return production


def saisir_fournee(  # noqa: PLR0913
    depots: Depots,
    *,
    production_id: int,
    code: str,
    pains: int,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatProduction:
    """Le réalisé se saisit par fournée ; le reste à produire suit (CdC §5.5)."""
    production = _en_cours(depots, production_id, auteur)
    if code not in production.sacs:
        message = f"{code} n'est pas au plan de cette session."
        raise RefusMetier("produit_hors_plan", message)
    if pains <= 0:
        message = "Une fournée compte des pains."
        raise RefusMetier("quantite_invalide", message)
    assert auteur.utilisateur_id is not None
    depots.productions.ajouter_fournee(
        production_id,
        code=code,
        pains=pains,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.plans.journal.enregistrer(
        Evenement(
            action="production.fournee",
            auteur=auteur,
            objet_type="production",
            objet_id=str(production_id),
            apres={"produit": code, "pains": pains},
        ),
    )
    apres = depots.productions.verrouiller(production_id)
    assert apres is not None
    return apres


def saisir_consommation(
    depots: Depots,
    *,
    production_id: int,
    quantites: dict[str, Decimal],
    auteur: Auteur,
    maintenant: datetime,
) -> EtatProduction:
    """Consommation réelle par matière ; une nouvelle saisie remplace la précédente."""
    production = _en_cours(depots, production_id, auteur)
    if inconnues := sorted(set(quantites) - depots.productions.matieres_connues()):
        message = f"Matières inconnues : {', '.join(inconnues)}."
        raise RefusMetier("matiere_inconnue", message, matieres=inconnues)
    if any(quantite < 0 for quantite in quantites.values()):
        message = "Une consommation n'est pas négative."
        raise RefusMetier("quantite_invalide", message)
    assert auteur.utilisateur_id is not None
    depots.productions.consommer(
        production_id,
        quantites,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    depots.plans.journal.enregistrer(
        Evenement(
            action="production.consommation",
            auteur=auteur,
            objet_type="production",
            objet_id=str(production_id),
            avant={m: str(q) for m, q in production.consommation.items()} or None,
            apres={m: str(q) for m, q in quantites.items()},
        ),
    )
    apres = depots.productions.verrouiller(production_id)
    assert apres is not None
    return apres


def cloturer(
    depots: Depots,
    *,
    production_id: int,
    auteur: Auteur,
    maintenant: datetime,
) -> EtatProduction:
    """R5 : impossible sans réalisé ni consommation."""
    production = _en_cours(depots, production_id, auteur)
    planifies = {code for code, sacs in production.sacs.items() if sacs}
    if raisons := raisons_de_ne_pas_cloturer(
        planifies=planifies,
        realise=production.realise,
        matieres=production.matieres,
        consommation=production.consommation,
    ):
        message = " ".join(RAISONS_CLOTURE[raison] for raison in raisons)
        raise RefusMetier("cloture_impossible", message, manquants=raisons)
    assert auteur.utilisateur_id is not None
    depots.productions.cloturer(
        production_id,
        auteur=auteur.utilisateur_id,
        le=maintenant,
    )
    realise = sum(production.realise.values())
    prevus = sum(production.prevus.values())
    depots.plans.journal.enregistrer(
        Evenement(
            action="production.cloturee",
            auteur=auteur,
            objet_type="production",
            objet_id=str(production_id),
            avant={"statut": StatutProduction.EN_COURS},
            apres={
                "statut": StatutProduction.CLOTUREE,
                "prevus": prevus,
                "realise": realise,
            },
        ),
    )
    session = production.session
    depots.plans.notificateur.notifier_type(
        "production.cloturee",
        titre=f"Production de {session.creneau} du {session.jour:%d/%m} clôturée",
        message=f"{realise} pains réalisés pour {prevus} prévus.",
        lien="/atelier/production",
    )
    apres = depots.productions.verrouiller(production_id)
    assert apres is not None
    return apres
