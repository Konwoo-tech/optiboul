from rest_framework import serializers

from optiboul.users.models import Profil
from optiboul.users.models import User


class UserSerializer(serializers.ModelSerializer[User]):
    profil = serializers.ChoiceField(
        choices=Profil.choices,
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = User
        fields = ["id", "name", "email", "url", "profil", "theme", "langue"]
        read_only_fields = ["id", "email"]

        extra_kwargs = {
            "url": {"view_name": "api:user-detail", "lookup_field": "pk"},
        }


class PreferencesSerializer(serializers.ModelSerializer[User]):
    """Ce que chacun change pour lui-même, quel que soit son profil (#347)."""

    class Meta:
        model = User
        fields = ["theme", "langue"]
