from datetime import date
from datetime import datetime
from datetime import time
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.clients.infrastructure.models import Client
from optiboul.conftest import MARDI
from optiboul.conftest import MARDI_8H
from optiboul.core.domain.semaines import FUSEAU
from optiboul.production.infrastructure.models import LignePlanProduction
from optiboul.production.infrastructure.models import PlanProduction
from optiboul.production.infrastructure.models import Produit
from optiboul.production.infrastructure.produits import fiche_en_cours
from optiboul.ventes.domain.commandes import NUIT
from optiboul.ventes.domain.commandes import Session
from optiboul.ventes.infrastructure.commandes import depot_commandes

CE_SOIR = Session(MARDI, NUIT)


def a(heure: int, minute: int = 0, jour: date = MARDI) -> datetime:
    return datetime.combine(jour, time(heure, minute), tzinfo=FUSEAU)


@pytest.fixture
def heure():
    """Fige l'heure de Yaoundé : heure(18, 45) dans un bloc with."""

    def figer(h: int, m: int = 0, jour: date = MARDI):
        return mock.patch("django.utils.timezone.now", return_value=a(h, m, jour))

    return figer


def commander(s44, auteur, nom: str, lignes: dict[str, int], session=CE_SOIR) -> None:
    client, _ = Client.objects.get_or_create(nom=nom)
    depot_commandes.enregistrer(
        semaine=s44.pk,
        client=client.pk,
        session=session,
        lignes=lignes,
        apres_heure_limite=False,
        auteur=auteur.pk,
        le=MARDI_8H,
    )


def plan_passe(s44, auteur, jours_avant: int, sacs: dict[str, int], statut="valide"):
    """Un plan d'une nuit passée, pour la comparaison aux dernières sessions."""
    plan = PlanProduction.objects.create(
        semaine=s44,
        jour=date.fromordinal(MARDI.toordinal() - jours_avant),
        creneau=NUIT,
        statut=statut,
        propose_par=auteur,
    )
    for code, nombre in sacs.items():
        produit = Produit.objects.get(code=code)
        fiche = fiche_en_cours(produit.pk)
        assert fiche is not None
        LignePlanProduction.objects.create(
            plan=plan,
            produit=produit,
            fiche=fiche,
            commandes=0,
            sacs=nombre,
            pains_prevus=nombre * fiche.pains_par_sac,
            boules=0,
        )
    return plan


@pytest.fixture
def commandes_du_soir(s44, caissiere) -> None:
    """Ce soir : 700 baguettes et 50 kirikous commandés."""
    commander(s44, caissiere, "Rachel Boutique", {"BAG": 400, "KO": 50})
    commander(s44, caissiere, "Mama Rasta", {"BAG": 300})


@pytest.fixture
def plan_valide(client_de, responsable_production, gerant, commandes_du_soir, heure):
    with heure(18, 40):
        client_de(responsable_production).post(
            reverse("api:production-proposer"),
            {},
            format="json",
        )
    with heure(18, 42):
        client_de(gerant).post(reverse("api:production-valider"), {}, format="json")


@pytest.fixture
def production(client_de, responsable_production, plan_valide, heure) -> dict:
    with heure(19):
        return (
            client_de(responsable_production)
            .post(reverse("api:production-ouvrir"), {}, format="json")
            .json()
        )
