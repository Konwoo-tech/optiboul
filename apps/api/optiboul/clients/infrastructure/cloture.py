"""Ce que les comptes clients apportent à la clôture et à la passation (R20, US-061)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from typing import Any

from optiboul.core.application.cloture import Controle
from optiboul.core.application.cloture import Niveau
from optiboul.core.application.cloture import enregistrer_action
from optiboul.core.application.cloture import enregistrer_controle
from optiboul.core.application.passation import enregistrer_section
from optiboul.core.infrastructure.journal import journaliser

from .comptes import SOLDE
from .models import Client
from .models import ReportDette

if TYPE_CHECKING:
    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.semaines import EtatSemaine


def debiteurs() -> list[tuple[Client, int]]:
    """Clients au solde négatif et leur solde, la plus grosse dette d'abord."""
    soldes = dict(
        Client.objects.annotate(solde=SOLDE)
        .filter(solde__lt=0)
        .values_list("pk", "solde"),
    )
    clients = Client.objects.in_bulk(list(soldes))
    return sorted(
        ((clients[pk], int(solde)) for pk, solde in soldes.items()),
        key=lambda ligne: (ligne[1], ligne[0].nom),
    )


def dettes_clients(semaine: EtatSemaine) -> Controle:
    """À voir : des clients doivent encore de l'argent ; leur dette sera reportée."""
    clients = debiteurs()
    if not clients:
        return Controle("dettes_clients", Niveau.OK)
    total = -sum(solde for _, solde in clients)
    return Controle(
        "dettes_clients",
        Niveau.SURVEILLER,
        f"{len(clients)} client(s) doivent {total} FCFA : la dette sera reportée.",
        {"clients": len(clients), "total": total},
    )


def reporter_dettes(semaine: EtatSemaine, auteur: Auteur) -> None:
    """R20 : chaque dette non soldée est reportée et marquée sur la semaine close."""
    reports = [
        ReportDette(semaine_id=semaine.id, client=client, montant=-solde)
        for client, solde in debiteurs()
    ]
    ReportDette.objects.bulk_create(reports, ignore_conflicts=True)
    if reports:
        journaliser(
            "dettes.reportees",
            auteur=auteur,
            objet_type="semaine",
            objet_id=semaine.id,
            apres={
                "clients": len(reports),
                "total": sum(report.montant for report in reports),
            },
        )


def section_dettes(semaine: EtatSemaine) -> dict[str, Any]:
    """Dettes reportées à la clôture, la plus grosse d'abord."""
    reports = ReportDette.objects.filter(semaine_id=semaine.id).select_related("client")
    lignes = [{"client": r.client.nom, "montant": r.montant} for r in reports]
    return {"lignes": lignes, "total": sum(ligne["montant"] for ligne in lignes)}


def enregistrer() -> None:
    enregistrer_controle("dettes_clients", dettes_clients)
    enregistrer_action("reporter_dettes", reporter_dettes)
    enregistrer_section("dettes_clients", section_dettes)
