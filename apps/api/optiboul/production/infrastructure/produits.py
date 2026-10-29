"""Fiches techniques en base (adaptateur du port `DepotFiches`)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from optiboul.production.application.produits import VersionFiche
from optiboul.production.domain.fiches import Fiche
from optiboul.stocks.infrastructure.models import Matiere

from .models import FicheTechnique
from .models import LigneRecette

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur


def fiche_de(ligne: FicheTechnique) -> Fiche:
    return Fiche(
        poids_boule=ligne.poids_boule,
        pains_par_boule=ligne.pains_par_boule,
        pains_par_sac=ligne.pains_par_sac,
        procede=ligne.procede,
        recette={r.matiere.code: r.quantite for r in ligne.recette.all()},
    )


def fiche_en_cours(produit_id: int) -> FicheTechnique | None:
    return (
        FicheTechnique.objects.filter(produit_id=produit_id)
        .prefetch_related("recette__matiere")
        .order_by("-version")
        .first()
    )


class DepotFichesDjango:
    def derniere(self, produit_id: int) -> VersionFiche | None:
        ligne = fiche_en_cours(produit_id)
        return VersionFiche(ligne.version, fiche_de(ligne)) if ligne else None

    def ajouter(
        self,
        produit_id: int,
        version: int,
        fiche: Fiche,
        auteur: Auteur,
    ) -> None:
        nouvelle = FicheTechnique.objects.create(
            produit_id=produit_id,
            version=version,
            poids_boule=fiche.poids_boule,
            pains_par_boule=fiche.pains_par_boule,
            pains_par_sac=fiche.pains_par_sac,
            procede=fiche.procede.strip(),
            cree_par_id=auteur.utilisateur_id,
            cree_par_nom=auteur.nom,
        )
        matieres = dict(Matiere.objects.values_list("code", "pk"))
        LigneRecette.objects.bulk_create(
            LigneRecette(fiche=nouvelle, matiere_id=matieres[code], quantite=quantite)
            for code, quantite in fiche.recette.items()
            if quantite
        )

    def matieres(self) -> set[str]:
        return set(Matiere.objects.values_list("code", flat=True))


depot_fiches = DepotFichesDjango()
