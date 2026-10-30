"""Rapports de session, de semaine et de mois, en PDF et en Excel (US-133, CdC §7)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from datetime import timedelta
from io import BytesIO
from typing import TYPE_CHECKING

from django.db.models import Sum
from django.template.loader import render_to_string
from openpyxl import Workbook

from optiboul.caisse.infrastructure.models import Caisse
from optiboul.core.domain.semaines import bornes
from optiboul.production.infrastructure.models import Fournee
from optiboul.rapports.domain.indicateurs import bornes_du_mois
from optiboul.ventes.infrastructure.models import Encaissement
from optiboul.ventes.infrastructure.models import Livraison

if TYPE_CHECKING:
    from optiboul.core.infrastructure.models import Semaine


@dataclass(frozen=True)
class Rapport:
    titre: str
    fichier: str  # nom sans extension
    lignes: list[tuple[str, str, int, int, int, int]]  # jour, créneau, puis montants

    @property
    def totaux(self) -> tuple[int, int, int, int]:
        return (
            sum(ligne[2] for ligne in self.lignes),
            sum(ligne[3] for ligne in self.lignes),
            sum(ligne[4] for ligne in self.lignes),
            sum(ligne[5] for ligne in self.lignes),
        )


ENTETES = ("Jour", "Créneau", "Ventes", "Recette", "Pains", "Écart de caisse")


def _lignes(debut: date, fin: date, creneau: str = "") -> list[tuple]:
    """Une ligne par session de vente de la période, sessions vides exclues."""
    caisses = Caisse.objects.filter(jour__gte=debut, jour__lt=fin).order_by(
        "jour",
        "creneau",
    )
    if creneau:
        caisses = caisses.filter(creneau=creneau)
    lignes = []
    for caisse in caisses:
        ventes = (
            Livraison.objects.filter(caisse=caisse, statut="livree").aggregate(
                total=Sum("montant_du"),
            )["total"]
            or 0
        )
        recette = (
            Encaissement.objects.filter(caisse=caisse).aggregate(
                total=Sum("montant"),
            )["total"]
            or 0
        )
        pains = (
            Fournee.objects.filter(
                production__plan__jour=caisse.jour,
                production__plan__creneau=caisse.creneau,
            ).aggregate(total=Sum("pains"))["total"]
            or 0
        )
        lignes.append(
            (
                f"{caisse.jour:%d/%m/%Y}",
                caisse.creneau,
                ventes,
                recette,
                pains,
                caisse.ecart or 0,
            ),
        )
    return lignes


def rapport_de_session(jour: date, creneau: str) -> Rapport:
    return Rapport(
        f"Session de {creneau} du {jour:%d/%m/%Y}",
        f"session-{jour:%Y-%m-%d}-{creneau}",
        _lignes(jour, jour + timedelta(days=1), creneau),
    )


def rapport_de_semaine(semaine: Semaine) -> Rapport:
    periode = bornes(semaine.annee, semaine.numero)
    debut = periode.debut.date()
    return Rapport(
        f"Semaine {semaine.numero} de {semaine.annee}",
        f"semaine-{semaine.annee}-{semaine.numero}",
        _lignes(debut, debut + timedelta(days=7)),
    )


def rapport_de_mois(mois: date) -> Rapport:
    debut, fin = bornes_du_mois(mois)
    return Rapport(
        f"Mois {mois:%m/%Y}",
        f"mois-{mois:%Y-%m}",
        _lignes(debut, fin),
    )


def en_pdf(rapport: Rapport) -> bytes:
    from weasyprint import HTML  # noqa: PLC0415 : bibliothèque lourde, chargée au besoin

    html = render_to_string(
        "rapports/rapport.html",
        {"rapport": rapport, "entetes": ENTETES},
    )
    return HTML(string=html).write_pdf()


def en_excel(rapport: Rapport) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    feuille.title = "Rapport"
    feuille.append([rapport.titre])
    feuille.append(list(ENTETES))
    for ligne in rapport.lignes:
        feuille.append(list(ligne))
    feuille.append(["Total", "", *rapport.totaux])
    tampon = BytesIO()
    classeur.save(tampon)
    return tampon.getvalue()
