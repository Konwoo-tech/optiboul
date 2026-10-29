import pytest

from optiboul.clients.infrastructure.models import Client
from optiboul.core.domain.erreurs import RefusMetier
from optiboul.demandes.application import demandes as cas
from optiboul.demandes.application.demandes import ObjetLie
from optiboul.demandes.application.demandes import TypeDemande


def _preparer(objet_id, auteur) -> ObjetLie:
    client = Client.objects.filter(pk=objet_id).first()
    if client is None:
        message = "Client inconnu."
        raise RefusMetier("objet_inconnu", message)
    return ObjetLie(f"Client {client.nom}", {"plafond": 2_000})


@pytest.fixture
def decisions() -> list[tuple[str, int, str]]:
    """Ce que la décision a changé sur l'objet lié : (décision, objet, décideur)."""
    return []


@pytest.fixture
def type_essai(decisions):
    """Type de demande d'essai : la caisse demande, la direction valide."""
    essai = TypeDemande(
        cle="essai",
        libelle="Essai",
        objet_type="client",
        emetteurs=frozenset({"caissier", "gerant"}),
        valideurs=lambda profil: ("gerant", "proprietaire"),
        preparer=_preparer,
        sur_accord=lambda d, qui: decisions.append(("accord", d.objet_id, qui.nom)),
        sur_refus=lambda d, qui: decisions.append(("refus", d.objet_id, qui.nom)),
    )
    cas.enregistrer_type(essai)
    yield essai
    cas._TYPES.pop("essai")  # noqa: SLF001


@pytest.fixture
def mama(db) -> Client:
    return Client.objects.create(nom="Mama Rasta")
