from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from hypothesis import HealthCheck
from hypothesis import settings as hypothesis_settings
from rest_framework.test import APIClient

from optiboul.users.tests.factories import UserFactory
from optiboul.users.tests.factories import utilisateur_avec_profil

if TYPE_CHECKING:
    from collections.abc import Callable

    from optiboul.users.models import User

# Les conteneurs de développement (Docker sous Windows) sont lents : les propriétés
# testées restent les mêmes, sans échéance par exemple ni alerte de lenteur.
hypothesis_settings.register_profile(
    "optiboul",
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
hypothesis_settings.load_profile("optiboul")


@pytest.fixture(autouse=True)
def _media_storage(settings, tmpdir) -> None:
    settings.MEDIA_ROOT = tmpdir.strpath


@pytest.fixture(autouse=True)
def _cache_vide() -> None:
    """Les paramètres sont lus via le cache : chaque test part d'un cache vide."""
    from django.core.cache import cache  # noqa: PLC0415

    cache.clear()


@pytest.fixture
def user(db) -> User:
    return UserFactory.create()


@pytest.fixture
def caissiere(db) -> User:
    return utilisateur_avec_profil("caissier", name="Rachel")


@pytest.fixture
def gerant(db) -> User:
    return utilisateur_avec_profil("gerant", name="Willy")


@pytest.fixture
def responsable_production(db) -> User:
    return utilisateur_avec_profil("production", name="Serge")


@pytest.fixture
def proprietaire(db) -> User:
    return utilisateur_avec_profil("proprietaire", name="Fotso")


@pytest.fixture
def administrateur(db) -> User:
    return utilisateur_avec_profil("administrateur", name="Admin")


@pytest.fixture
def client_de() -> Callable[[User | None], APIClient]:
    """Client d'API connecté en tant que la personne donnée (anonyme si None)."""

    def fabriquer(utilisateur: User | None) -> APIClient:
        client = APIClient()
        if utilisateur is not None:
            client.force_authenticate(utilisateur)
        return client

    return fabriquer
