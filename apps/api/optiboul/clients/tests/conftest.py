import pytest

from optiboul.clients.infrastructure.models import Client
from optiboul.clients.infrastructure.models import MouvementCompte


@pytest.fixture
def comptes(s44, caissiere) -> dict[str, Client]:
    """Mama doit 1 500, Raoul 3 000 (plafond dépassé), Rachel a 500 d'avance."""
    clients = {}
    for nom, solde, telephone in [
        ("Mama Rasta", -1_500, "699112233"),
        ("Raoul", -3_000, ""),
        ("Rachel Boutique", 500, ""),
    ]:
        client = Client.objects.create(nom=nom, telephone=telephone)
        MouvementCompte.objects.create(
            client=client,
            semaine=s44,
            sens=1 if solde > 0 else -1,
            montant=abs(solde),
            source_type="reprise",
            source_id=0,
            auteur=caissiere,
        )
        clients[nom] = client
    return clients
