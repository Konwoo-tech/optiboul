import re
from pathlib import Path

import pytest
from django.urls import reverse

from optiboul.notifications.domain.routage import libelle_du_genre
from optiboul.notifications.infrastructure.envois import notificateur

RACINE = Path(__file__).resolve().parents[2]
GENRES = re.compile(r"""(?:notifier_type\(\s*|genre=)"([a-z_]+\.[a-z_]+)\"""")


def test_chaque_genre_emis_a_un_libelle():
    emis = set()
    for fichier in RACINE.rglob("*.py"):
        if "tests" not in fichier.parts:
            emis |= set(GENRES.findall(fichier.read_text(encoding="utf-8")))
    assert "caisse.hors_planning" in emis
    assert [genre for genre in sorted(emis) if libelle_du_genre(genre) == genre] == []


def test_genre_inconnu_rendu_tel_quel():
    assert libelle_du_genre("autre.chose") == "autre.chose"


pytestmark = pytest.mark.django_db


def test_libelle_lisible_par_la_caisse(client_de, caissiere):
    notificateur.notifier(
        [caissiere.pk],
        genre="caisse.hors_planning",
        titre="Caisse ouverte",
        lien="/comptoir/caisses",
    )
    client = client_de(caissiere)
    notification = client.get(reverse("api:notification-list")).json()["results"][0]
    assert notification["genre_libelle"] == "Caisse ouverte hors planning"
    groupe = client.get(reverse("api:notification-regroupees")).json()[0]
    assert groupe["genre_libelle"] == "Caisse ouverte hors planning"
