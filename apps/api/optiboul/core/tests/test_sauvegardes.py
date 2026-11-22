import base64
import io
import os
from datetime import timedelta
from pathlib import Path
from unittest import mock

import pytest
from cryptography.exceptions import InvalidTag
from django.urls import reverse
from django.utils import timezone

from optiboul.core.domain.sauvegardes import Declencheur
from optiboul.core.domain.sauvegardes import Genre
from optiboul.core.domain.sauvegardes import Statut
from optiboul.core.infrastructure import sauvegardes as infra
from optiboul.core.infrastructure import tasks
from optiboul.core.infrastructure.models import LigneJournal
from optiboul.core.infrastructure.models import Sauvegarde
from optiboul.notifications.infrastructure.models import Notification

pytestmark = pytest.mark.django_db

CLE = os.urandom(32)
MO = 1024 * 1024


@pytest.fixture(autouse=True)
def _reglages(settings, tmp_path):
    settings.OPTIBOUL_DOSSIER_SAUVEGARDES = str(tmp_path / "sauvegardes")
    settings.OPTIBOUL_CLE_SAUVEGARDE = base64.urlsafe_b64encode(CLE).decode()
    settings.AWS_STORAGE_BUCKET_NAME = "optiboul-test"


def _faux_pg_dump(self, chemin: Path) -> int:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(b"PGDMP copie de test")
    return chemin.stat().st_size


def _cloud_reussie(il_y_a: timedelta) -> None:
    Sauvegarde.objects.create(
        genre=Genre.CLOUD,
        declencheur=Declencheur.PLANIFIEE,
        statut=Statut.REUSSIE,
        fin=timezone.now() - il_y_a,
    )


@pytest.mark.parametrize("taille", [0, 10, MO, 3 * MO + 7])
def test_chiffrement_aller_retour(taille):
    donnees = os.urandom(taille)
    chiffre = io.BytesIO()
    infra.chiffrer(io.BytesIO(donnees), chiffre, CLE)
    clair = io.BytesIO()
    infra.dechiffrer(io.BytesIO(chiffre.getvalue()), clair, CLE)
    assert clair.getvalue() == donnees


def test_un_fichier_modifie_ou_tronque_est_refuse():
    chiffre = io.BytesIO()
    infra.chiffrer(io.BytesIO(os.urandom(2 * MO + 1)), chiffre, CLE)
    octets = bytearray(chiffre.getvalue())
    octets[len(infra.EN_TETE) + 40] ^= 1
    with pytest.raises(InvalidTag):
        infra.dechiffrer(io.BytesIO(bytes(octets)), io.BytesIO(), CLE)
    # Derniers blocs retirés : le bloc restant n'est pas marqué « dernier ».
    tronque = chiffre.getvalue()[: len(infra.EN_TETE) + 4 + 12 + MO + 16]
    with pytest.raises(InvalidTag):
        infra.dechiffrer(io.BytesIO(tronque), io.BytesIO(), CLE)


def test_cle_absente_ou_invalide(settings):
    settings.OPTIBOUL_CLE_SAUVEGARDE = ""
    with pytest.raises(infra.CleAbsente):
        infra.cle_de_chiffrement()
    settings.OPTIBOUL_CLE_SAUVEGARDE = base64.urlsafe_b64encode(b"court").decode()
    with pytest.raises(infra.CleAbsente):
        infra.cle_de_chiffrement()


def test_sauvegarde_locale_puis_copie_cloud_chiffree(settings):
    deposes = []

    def faux_upload(chemin, compartiment, objet):
        deposes.append((Path(chemin).read_bytes(), compartiment, objet))

    with (
        mock.patch.object(infra.PgDump, "exporter", _faux_pg_dump),
        mock.patch("boto3.client") as client,
    ):
        client.return_value.upload_file.side_effect = faux_upload
        locale_id = tasks.sauvegarder(Declencheur.CLOTURE_CAISSE)

    locale = Sauvegarde.objects.get(pk=locale_id)
    assert locale.statut == Statut.REUSSIE
    assert locale.declencheur == Declencheur.CLOTURE_CAISSE
    assert Path(locale.emplacement).read_bytes() == b"PGDMP copie de test"
    cloud = Sauvegarde.objects.get(genre=Genre.CLOUD)
    assert cloud.statut == Statut.REUSSIE
    assert cloud.source == locale
    contenu, compartiment, objet = deposes[0]
    assert compartiment == "optiboul-test"
    assert objet.startswith("sauvegardes/optiboul-")
    assert objet.endswith(".dump.chiffre")
    assert b"PGDMP" not in contenu
    clair = io.BytesIO()
    infra.dechiffrer(io.BytesIO(contenu), clair, CLE)
    assert clair.getvalue() == b"PGDMP copie de test"
    # Le fichier chiffré temporaire ne reste pas sur le serveur.
    assert list(Path(settings.OPTIBOUL_DOSSIER_SAUVEGARDES).glob("*.chiffre")) == []


def test_sans_reseau_la_copie_locale_reste():
    with (
        mock.patch.object(infra.PgDump, "exporter", _faux_pg_dump),
        mock.patch("boto3.client", side_effect=OSError("réseau injoignable")),
    ):
        tasks.sauvegarder(Declencheur.PLANIFIEE)
    assert Sauvegarde.objects.get(genre=Genre.LOCALE).statut == Statut.REUSSIE
    cloud = Sauvegarde.objects.get(genre=Genre.CLOUD)
    assert cloud.statut == Statut.ECHEC
    assert "réseau injoignable" in cloud.erreur


def test_echec_de_pg_dump_enregistre_et_journalise():
    with (
        mock.patch.object(
            infra.PgDump,
            "exporter",
            side_effect=OSError("disque plein"),
        ),
        pytest.raises(OSError, match="disque plein"),
    ):
        tasks.sauvegarder(Declencheur.PLANIFIEE)
    assert Sauvegarde.objects.get().statut == Statut.ECHEC
    assert LigneJournal.objects.get().action == "sauvegarde.echec"


def test_sauvegarde_planifiee_seulement_si_due():
    Sauvegarde.objects.create(
        genre=Genre.LOCALE,
        declencheur=Declencheur.PLANIFIEE,
        statut=Statut.REUSSIE,
        fin=timezone.now() - timedelta(hours=1),
    )
    with mock.patch.object(tasks, "sauvegarder") as sauvegarder:
        assert tasks.sauvegarde_planifiee() is None
        sauvegarder.assert_not_called()
        Sauvegarde.objects.update(fin=timezone.now() - timedelta(hours=4))
        tasks.sauvegarde_planifiee()
        sauvegarder.assert_called_once_with(Declencheur.PLANIFIEE)


def test_alerte_sans_copie_cloud_une_fois_par_jour(
    administrateur,
    proprietaire,
    gerant,
):
    _cloud_reussie(timedelta(hours=49))
    assert tasks.verifier_copie_cloud() is True
    destinataires = set(Notification.objects.values_list("destinataire", flat=True))
    assert destinataires == {administrateur.pk, proprietaire.pk}
    assert tasks.verifier_copie_cloud() is False
    assert Notification.objects.count() == 2


def test_pas_d_alerte_avec_une_copie_recente(administrateur):
    _cloud_reussie(timedelta(hours=2))
    assert tasks.verifier_copie_cloud() is False


def test_api_etat_et_lancement(
    client_de,
    administrateur,
    proprietaire,
    django_capture_on_commit_callbacks,
):
    client = client_de(administrateur)
    assert client.get(reverse("api:sauvegarde-etat")).json() == {
        "derniere_locale": None,
        "derniere_cloud": None,
        "cloud_en_retard": True,
        "seuil_alerte_heures": 48,
        "derniere_echec": None,
    }
    with (
        mock.patch.object(tasks.sauvegarder, "delay") as delay,
        django_capture_on_commit_callbacks(execute=True),
    ):
        assert client.post(reverse("api:sauvegarde-lancer")).status_code == 202
    assert delay.call_args.args[0] == Declencheur.MANUELLE
    assert (
        client_de(proprietaire).get(reverse("api:sauvegarde-list")).status_code == 403
    )
