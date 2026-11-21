"""Rapport de passation : dettes fournisseurs et stock bas renseignés (#369)."""

from datetime import date
from decimal import Decimal

import pytest

from optiboul.achats.infrastructure.cloture import section_dettes_fournisseurs
from optiboul.achats.infrastructure.models import FactureFournisseur
from optiboul.achats.infrastructure.models import Fournisseur
from optiboul.achats.infrastructure.models import PaiementFournisseur
from optiboul.core.application.passation import preparer
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.depenses.infrastructure.models import Depense
from optiboul.stocks.domain.stocks import GenreMouvementStock
from optiboul.stocks.domain.stocks import Sens
from optiboul.stocks.infrastructure.passation import section_stock_bas
from optiboul.stocks.infrastructure.stocks import stock

pytestmark = pytest.mark.django_db


@pytest.fixture
def factures(s44, gerant):
    moulin = Fournisseur.objects.create(nom="Moulin du Centre")
    glace = Fournisseur.objects.create(nom="Glacière d'Olembé")
    entamee = FactureFournisseur.objects.create(
        numero=41,
        fournisseur=moulin,
        semaine=s44,
        montant=195_250,
        echeance=date(2026, 11, 2),
        statut="en_cours",
    )
    depense = Depense.objects.create(
        numero=1,
        semaine=s44,
        categorie="matieres",
        libelle="Acompte farine",
        montant=95_250,
        paye_par="banque",
        rattachement="stock",
        statut="validee",
        auteur=gerant,
        auteur_profil="gerant",
    )
    PaiementFournisseur.objects.create(
        facture=entamee,
        montant=95_250,
        mode="banque",
        depense=depense,
        paye_par=gerant,
    )
    FactureFournisseur.objects.create(
        numero=42,
        fournisseur=glace,
        semaine=s44,
        montant=12_000,
        echeance=date(2026, 11, 5),
    )
    FactureFournisseur.objects.create(
        numero=40,
        fournisseur=glace,
        semaine=s44,
        montant=5_000,
        echeance=date(2026, 10, 30),
        statut="payee",
    )


def test_dettes_fournisseurs_reste_du_et_total(s44, factures):
    semaine = depot_semaines.obtenir(s44.pk)
    assert semaine is not None
    section = section_dettes_fournisseurs(semaine)
    assert [(ligne["facture"], ligne["reste"]) for ligne in section["lignes"]] == [
        ("FAC-41", 100_000),
        ("FAC-42", 12_000),
    ]
    assert section["lignes"][0]["fournisseur"] == "Moulin du Centre"
    assert section["total"] == 112_000


def test_stock_bas_quantite_et_seuil(s44, gerant):
    stock.mouvementer(
        {"farine": Decimal(500)},
        sens=Sens.ENTREE,
        genre=GenreMouvementStock.RECEPTION,
        source_type="essai",
        source_id=1,
        semaine=s44.pk,
        auteur=gerant.pk,
    )
    semaine = depot_semaines.obtenir(s44.pk)
    assert semaine is not None
    section = section_stock_bas(semaine)
    noms = [ligne["matiere"] for ligne in section["lignes"]]
    # Sans consommation connue, seule une matière à zéro est « stock bas ».
    assert "Farine" not in noms
    assert noms
    ligne = section["lignes"][0]
    assert set(ligne) == {"matiere", "quantite", "seuil", "unite"}
    assert ligne["quantite"] <= 0


def test_le_rapport_n_a_plus_de_section_vide(s44, factures):
    passation = preparer(depot_semaines, s44.pk)
    sections = {section.cle: section.contenu for section in passation.sections}
    assert all(contenu is not None for contenu in sections.values())
    assert (sections["dettes_fournisseurs"] or {})["total"] == 112_000
