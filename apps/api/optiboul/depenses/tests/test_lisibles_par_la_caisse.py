"""Ce dont la caisse a besoin pour saisir une dépense (#323)."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from optiboul.achats.infrastructure.models import Fournisseur

DEPENSES = reverse("api:depense-list")
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32

pytestmark = pytest.mark.django_db


def test_fournisseurs_en_liste_reduite(client_de, caissiere):
    Fournisseur.objects.create(nom="Moulin du Centre", telephone="699000111")
    Fournisseur.objects.create(nom="Ancien", actif=False)
    reponse = client_de(caissiere).get(reverse("api:fournisseur-choix"))
    assert reponse.status_code == 200
    assert reponse.json() == [
        {"id": reponse.json()[0]["id"], "nom": "Moulin du Centre", "matieres": []},
    ]
    assert client_de(caissiere).get(reverse("api:fournisseur-list")).status_code == 403


def _avec_justificatif(client, cle="j"):
    corps = {
        "categorie": "petit_materiel",
        "libelle": "Seaux",
        "montant": 3_000,
        "paye_par": "banque",
        "rattachement": "semaine",
        "justificatif": SimpleUploadedFile("ticket.png", PNG, content_type="image/png"),
    }
    return client.post(DEPENSES, corps, format="multipart", HTTP_IDEMPOTENCY_KEY=cle)


def test_justificatif_servi_par_l_api(
    client_de,
    gerant,
    proprietaire,
    caissiere,
    s44,
    horloge,
):
    depense = _avec_justificatif(client_de(gerant)).json()
    url = depense["justificatif_url"]
    assert url == reverse("api:depense-justificatif", kwargs={"pk": depense["id"]})
    reponse = client_de(proprietaire).get(url)
    assert reponse.status_code == 200
    assert reponse["Content-Type"] == "image/png"
    assert b"".join(reponse.streaming_content) == PNG
    # Une caissière ne voit que ses dépenses : ni la ligne ni le fichier.
    assert client_de(caissiere).get(url).status_code == 404


def test_sans_justificatif(client_de, gerant, s44, horloge):
    corps = {
        "categorie": "petit_materiel",
        "libelle": "Seaux",
        "montant": 3_000,
        "paye_par": "banque",
        "rattachement": "semaine",
    }
    depense = (
        client_de(gerant)
        .post(
            DEPENSES,
            corps,
            format="json",
            HTTP_IDEMPOTENCY_KEY="s",
        )
        .json()
    )
    assert depense["justificatif_url"] is None
    url = reverse("api:depense-justificatif", kwargs={"pk": depense["id"]})
    assert client_de(gerant).get(url).status_code == 404
