import pytest
from django.urls import reverse
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_sante_accessible_sans_connexion():
    response = APIClient().get(reverse("api:sante"))
    assert response.status_code == 200
    assert response.json() == {"statut": "ok", "base": True}
