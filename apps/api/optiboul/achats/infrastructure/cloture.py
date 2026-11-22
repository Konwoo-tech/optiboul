"""Ce que les factures fournisseurs apportent à la clôture de la semaine (#344) et
au rapport de passation (#369)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from django.utils import timezone

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_controle
from optiboul.core.application.passation import enregistrer_section

from .factures import non_soldees
from .factures import numero_affiche
from .models import FactureFournisseur

if TYPE_CHECKING:
    from optiboul.core.application.semaines import EtatSemaine


def factures_en_retard(semaine: EtatSemaine) -> Controle:
    """À voir (CdC §5.1) : factures non payées dont l'échéance est passée."""
    factures = list(
        FactureFournisseur.objects.exclude(statut="payee")
        .filter(echeance__lt=timezone.localdate())
        .select_related("fournisseur")
        .order_by("echeance", "numero"),
    )
    if not factures:
        return Controle("factures_en_retard", Niveau.OK, "", {"factures": []})
    total = sum(f.montant for f in factures)
    return Controle(
        "factures_en_retard",
        Niveau.SURVEILLER,
        f"{len(factures)} facture(s) fournisseur en retard, {total} FCFA.",
        {
            "factures": [
                {
                    "id": f.pk,
                    "numero": numero_affiche(f.numero),
                    "libelle": f.fournisseur.nom,
                    "montant": f.montant,
                    "echeance": f.echeance.isoformat(),
                }
                for f in factures
            ],
        },
    )


def section_dettes_fournisseurs(semaine: EtatSemaine) -> dict[str, Any]:
    """Factures non soldées à la clôture : fournisseur, reste dû, total (#369)."""
    lignes = non_soldees()
    return {"lignes": lignes, "total": sum(ligne["reste"] for ligne in lignes)}


def enregistrer() -> None:
    enregistrer_controle("factures_en_retard", factures_en_retard)
    enregistrer_section("dettes_fournisseurs", section_dettes_fournisseurs)
