"""Lancer une copie locale ou cloud et la suivre ; échec signalé (#359)."""

import base64
import os
from pathlib import Path  # noqa: TC003
from unittest import mock

import pytest
from django.urls import reverse

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut
from optiboul.core.infrastructure import sauvegardes as infra
from optiboul.core.infrastructure import tasks
from optiboul.core.infrastructure.models import Sauvegarde

pytestmark = pytest.mark.django_db

LANCER = reverse("api:sauvegarde-lancer")
ETAT = reverse("api:sauvegarde-etat")


@pytest.fixture(autouse=True)
def _reglages(settings, tmp_path):
    settings.OPTIBOUL_DOSSIER_SAUVEGARDES = str(tmp_path / "sauvegardes")
    settings.OPTIBOUL_CLE_SAUVEGARDE = base64.urlsafe_b64encode(os.urandom(32)).decode()
    settings.AWS_STORAGE_BUCKET_NAME = "optiboul-test"


def _faux_pg_dump(self, chemin: Path) -> int:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(b"PGDMP copie de test")
    return chemin.stat().st_size


def _lancer(client, capture, corps):
    with mock.patch.object(tasks.sauvegarder, "delay") as delay, capture(execute=True):
        reponse = client.post(LANCER, corps, format="json")
    return reponse, delay


def test_copie_locale_suivie(
    client_de,
    administrateur,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    reponse, delay = _lancer(
        client,
        django_capture_on_commit_callbacks,
        {"genre": "locale"},
    )
    assert reponse.status_code == 202
    lancee = reponse.json()
    assert lancee | {"id": 0} == {"id": 0, "genre": "locale", "statut": "en_cours"}
    delay.assert_called_once_with(
        Declencheur.MANUELLE,
        lancee["id"],
        None,
        avec_cloud=False,
    )
    suivi = reverse("api:sauvegarde-detail", args=[lancee["id"]])
    assert client.get(suivi).json()["statut"] == "en_cours"
    with mock.patch.object(infra.PgDump, "exporter", _faux_pg_dump):
        assert (
            tasks.sauvegarder(*delay.call_args.args, **delay.call_args.kwargs)
            == (lancee["id"])
        )
    copie = client.get(suivi).json()
    assert (copie["genre"], copie["statut"]) == ("locale", "reussie")
    assert not Sauvegarde.objects.filter(genre=Genre.CLOUD).exists()


def test_copie_cloud_suivie_par_sa_ligne_cloud(
    client_de,
    administrateur,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    reponse, delay = _lancer(client, django_capture_on_commit_callbacks, {})
    lancee = reponse.json()
    assert lancee["genre"] == "cloud"
    cloud = Sauvegarde.objects.get(pk=lancee["id"])
    assert cloud.genre == Genre.CLOUD
    assert cloud.source is not None
    with (
        mock.patch.object(infra.PgDump, "exporter", _faux_pg_dump),
        mock.patch.object(infra.CoffreS3, "deposer", return_value="s3://b/c"),
    ):
        tasks.sauvegarder(*delay.call_args.args, **delay.call_args.kwargs)
    cloud.refresh_from_db()
    assert (cloud.statut, cloud.emplacement) == (Statut.REUSSIE, "s3://b/c")
    assert Sauvegarde.objects.count() == 2


def test_echec_local_signale_et_cloud_en_echec(
    client_de,
    administrateur,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    reponse, delay = _lancer(client, django_capture_on_commit_callbacks, {})
    with (
        mock.patch.object(
            infra.PgDump,
            "exporter",
            side_effect=OSError("disque plein"),
        ),
        pytest.raises(OSError, match="disque plein"),
    ):
        tasks.sauvegarder(*delay.call_args.args, **delay.call_args.kwargs)
    cloud = Sauvegarde.objects.get(pk=reponse.json()["id"])
    assert cloud.statut == Statut.ECHEC
    assert "disque plein" in cloud.erreur
    echec = client.get(ETAT).json()["derniere_echec"]
    assert echec["erreur"] in {"disque plein", cloud.erreur}
    assert echec["genre"] in {"locale", "cloud"}


def test_un_echec_suivi_d_une_reussite_n_est_plus_signale(client_de, administrateur):
    Sauvegarde.objects.create(
        genre=Genre.LOCALE,
        declencheur=Declencheur.PLANIFIEE,
        statut=Statut.ECHEC,
        erreur="pg_dump absent",
    )
    client = client_de(administrateur)
    assert client.get(ETAT).json()["derniere_echec"]["erreur"] == "pg_dump absent"
    Sauvegarde.objects.create(
        genre=Genre.LOCALE,
        declencheur=Declencheur.PLANIFIEE,
        statut=Statut.REUSSIE,
    )
    assert client.get(ETAT).json()["derniere_echec"] is None


def test_genre_inconnu_et_droits(client_de, administrateur, proprietaire):
    reponse = client_de(administrateur).post(LANCER, {"genre": "usb"}, format="json")
    assert reponse.status_code == 400
    assert client_de(proprietaire).post(LANCER, {}, format="json").status_code == 403
