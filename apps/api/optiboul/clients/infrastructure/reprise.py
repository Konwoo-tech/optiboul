"""Import des clients, tarifs et soldes du classeur Excel (US-150).

Feuilles attendues : « Clients » (nom, type, telephone, lieu, plafond, solde) et
« Tarifs » (client, produit, prix). Une simulation calcule le rapport sans rien garder.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from typing import TYPE_CHECKING
from typing import Any
from zipfile import BadZipFile

from django.db import transaction
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from optiboul.clients.domain.clients import plafond_du_client
from optiboul.clients.domain.reprise import LigneRejetee
from optiboul.clients.domain.reprise import lire_client
from optiboul.clients.domain.reprise import lire_tarif
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.core.infrastructure.journal import journaliser
from optiboul.core.infrastructure.parametres import parametre
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.production.infrastructure.models import Produit

from .models import Client
from .models import MouvementCompte
from .models import TarifClient

if TYPE_CHECKING:
    from collections.abc import Iterator
    from typing import BinaryIO

    from optiboul.core.application.journal import Auteur
    from optiboul.core.application.semaines import EtatSemaine


@dataclass
class RapportImport:
    clients: int = 0
    tarifs: int = 0
    soldes: int = 0
    rejets: list[dict[str, Any]] = field(default_factory=list)
    dettes_au_dela_du_plafond: list[dict[str, Any]] = field(default_factory=list)

    def rejeter(self, feuille: str, ligne: int, raison: str) -> None:
        self.rejets.append({"feuille": feuille, "ligne": ligne, "raison": raison})


def _lignes(feuille: Any) -> Iterator[tuple[int, dict[str, Any]]]:
    rangees = feuille.iter_rows(values_only=True)
    entetes = [str(e or "").strip().lower() for e in next(rangees, ())]
    for numero, rangee in enumerate(rangees, start=2):
        if any(valeur not in {None, ""} for valeur in rangee):
            yield numero, dict(zip(entetes, rangee, strict=False))


def _ouvrir(fichier: BinaryIO) -> Any:
    try:
        classeur = load_workbook(fichier, read_only=True, data_only=True)
    except (InvalidFileException, BadZipFile, OSError, KeyError) as erreur:
        message = "Ce fichier n'est pas un classeur Excel lisible."
        raise RefusMetier("fichier_invalide", message) from erreur
    if "Clients" not in classeur.sheetnames:
        raise RefusMetier("fichier_invalide", "La feuille « Clients » est absente.")
    return classeur


def _importer_clients(
    feuille: Any,
    rapport: RapportImport,
    semaine: EtatSemaine | None,
    auteur: Auteur,
) -> None:
    general = parametre("plafond_dette_client")
    for numero, valeurs in _lignes(feuille):
        try:
            ligne = lire_client(valeurs)
        except LigneRejetee as rejet:
            rapport.rejeter("Clients", numero, str(rejet))
            continue
        if Client.objects.filter(nom__iexact=ligne.nom).exists():
            rapport.rejeter("Clients", numero, f"Déjà présent : {ligne.nom}.")
            continue
        if ligne.solde and semaine is None:
            rapport.rejeter("Clients", numero, "Solde sans semaine ouverte (R1).")
            continue
        client = Client.objects.create(
            nom=ligne.nom,
            type=ligne.type,
            telephone=ligne.telephone,
            lieu=ligne.lieu,
            plafond=ligne.plafond,
        )
        rapport.clients += 1
        if not ligne.solde:
            continue
        assert semaine is not None
        assert auteur.utilisateur_id is not None
        MouvementCompte.objects.create(
            client=client,
            semaine_id=semaine.id,
            sens=1 if ligne.solde > 0 else -1,
            montant=abs(ligne.solde),
            source_type="reprise",
            source_id=client.pk,
            auteur_id=auteur.utilisateur_id,
        )
        rapport.soldes += 1
        plafond = plafond_du_client(ligne.plafond, general)
        if -ligne.solde > plafond:
            rapport.dettes_au_dela_du_plafond.append(
                {"nom": ligne.nom, "dette": -ligne.solde, "plafond": plafond},
            )


def _importer_tarifs(feuille: Any, rapport: RapportImport) -> None:
    produits = dict(Produit.objects.values_list("code", "pk"))
    for numero, valeurs in _lignes(feuille):
        try:
            nom, code, prix = lire_tarif(valeurs)
        except LigneRejetee as rejet:
            rapport.rejeter("Tarifs", numero, str(rejet))
            continue
        client = Client.objects.filter(nom__iexact=nom).first()
        if client is None:
            rapport.rejeter("Tarifs", numero, f"Client inconnu : {nom}.")
            continue
        if code not in produits:
            rapport.rejeter("Tarifs", numero, f"Produit inconnu : {code}.")
            continue
        TarifClient.objects.update_or_create(
            client=client,
            produit_id=produits[code],
            defaults={"prix": prix},
        )
        rapport.tarifs += 1


def importer(
    fichier: BinaryIO,
    *,
    confirmer: bool,
    auteur: Auteur,
) -> RapportImport:
    """Toutes les lignes valides passent, les autres vont au rapport des rejets."""
    classeur = _ouvrir(fichier)
    rapport = RapportImport()
    with transaction.atomic():
        _importer_clients(
            classeur["Clients"],
            rapport,
            depot_semaines.ouverte(),
            auteur,
        )
        if "Tarifs" in classeur.sheetnames:
            _importer_tarifs(classeur["Tarifs"], rapport)
        if confirmer:
            journaliser(
                "clients.import",
                auteur=auteur,
                objet_type="client",
                apres={
                    "clients": rapport.clients,
                    "tarifs": rapport.tarifs,
                    "soldes": rapport.soldes,
                    "rejets": len(rapport.rejets),
                },
            )
        else:
            transaction.set_rollback(True)
    return rapport
