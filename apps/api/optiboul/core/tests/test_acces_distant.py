"""La configuration de l'entrée distante (US-156, ADR-19), lue dans les fichiers."""

import re
from pathlib import Path

import pytest
import yaml
from django.conf import settings

RACINE = Path(settings.BASE_DIR)


@pytest.fixture
def traefik():
    chemin = RACINE / "compose" / "production" / "traefik" / "traefik.yml"
    return yaml.safe_load(chemin.read_text(encoding="utf-8"))


def _routeurs_distants(traefik):
    return {
        nom: routeur
        for nom, routeur in traefik["http"]["routers"].items()
        if "remote" in routeur["entryPoints"]
    }


def test_rien_d_administratif_sur_l_entree_distante(traefik):
    distants = _routeurs_distants(traefik)
    assert set(distants) == {"django-distant", "web-distant"}
    assert "django-admin" not in distants["django-distant"]["rule"]
    assert "flower" not in traefik["http"]["routers"]["django-distant"]["service"]


def test_chaque_entree_impose_son_en_tete(traefik):
    """Traefik écrase l'en-tête : un client ne peut pas se dire « locale »."""
    routeurs = traefik["http"]["routers"]
    assert "entree-distante" in routeurs["django-distant"]["middlewares"]
    assert "entree-locale" in routeurs["django"]["middlewares"]


def test_en_tetes_de_transfert_du_seul_reseau_docker(traefik):
    transfert = traefik["entryPoints"]["remote"]["forwardedHeaders"]
    assert transfert["trustedIPs"] == ["172.16.0.0/12"]


def test_hsts_coherent_entre_django_et_traefik(traefik):
    production = RACINE / "config" / "settings" / "production.py"
    texte = production.read_text(encoding="utf-8")
    trouve = re.search(r'"DJANGO_SECURE_HSTS_SECONDS",\s*default=([\d_]+)', texte)
    assert trouve is not None
    annee = int(trouve.group(1).replace("_", ""))
    securite = traefik["http"]["middlewares"]["securite"]["headers"]
    assert annee == securite["stsSeconds"]


def test_session_de_la_journee_au_plus():
    assert settings.SESSION_COOKIE_AGE == 12 * 3600
