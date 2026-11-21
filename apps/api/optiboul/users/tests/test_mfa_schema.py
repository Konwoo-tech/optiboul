"""`GET /mfa/` renvoie un objet, et le schéma le dit (#357)."""

import pytest
from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator

pytestmark = pytest.mark.django_db


def test_le_schema_decrit_un_objet():
    schema = SchemaGenerator().get_schema(request=None, public=True)
    reponse = schema["paths"]["/api/v1/mfa/"]["get"]["responses"]["200"]
    assert reponse["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/EtatMfa",
    }


def test_le_serveur_renvoie_un_objet(client_de, caissiere):
    etat = client_de(caissiere).get(reverse("api:mfa-list")).json()
    assert isinstance(etat, dict)
    assert set(etat) == {"totp", "codesSecoursRestants"}
