"""Chaque lien émis par l'API mène à un écran du front (#298)."""

import re
from pathlib import Path

import pytest

from optiboul.demandes.application.demandes import _TYPES
from optiboul.notifications.domain.liens import est_lien_d_ecran

RACINE = Path(__file__).resolve().parents[2]
# lien="/…", LIEN = "/…", lien = f"/…{x}" : la partie fixe suffit à choisir l'écran.
LIENS = re.compile(r"""\b(?:lien|LIEN)\s*=\s*f?"(/[^"{]*)""")


@pytest.mark.parametrize(
    ("lien", "valide"),
    [
        ("", True),
        ("/comptoir/caisses", True),
        ("/atelier/stocks?onglet=inventaires", True),
        ("/gestion/semaines?passation=12", True),
        ("/gestion/paie", False),
        ("/atelier/stocks/controles", False),
        ("/gestion/semaines?semaine=12", False),
        ("gestion/semaines", False),
    ],
)
def test_forme_des_liens(lien, valide):
    assert est_lien_d_ecran(lien) is valide


def _liens_du_code() -> set[str]:
    trouves = set()
    for fichier in RACINE.rglob("*.py"):
        if "tests" in fichier.parts or "migrations" in fichier.parts:
            continue
        trouves |= set(LIENS.findall(fichier.read_text(encoding="utf-8")))
    return trouves


def test_les_liens_ecrits_dans_le_code():
    liens = _liens_du_code()
    assert "/comptoir/caisses" in liens  # la recherche trouve bien les liens
    assert [lien for lien in sorted(liens) if not est_lien_d_ecran(lien)] == []


def test_les_liens_des_types_de_demande():
    liens = {type_demande.lien for type_demande in _TYPES.values()}
    assert liens
    assert [lien for lien in sorted(liens) if not est_lien_d_ecran(lien)] == []
