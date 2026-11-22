from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin
from rest_framework.mixins import RetrieveModelMixin
from rest_framework.mixins import UpdateModelMixin
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from optiboul.core.api.contexte import auteur_de
from optiboul.core.infrastructure.journal import journaliser
from optiboul.users.models import User

from .serializers import PreferencesSerializer
from .serializers import UserSerializer


class UserViewSet(RetrieveModelMixin, ListModelMixin, UpdateModelMixin, GenericViewSet):
    serializer_class = UserSerializer
    queryset = User.objects.all()
    lookup_field = "pk"

    def get_queryset(self, *args, **kwargs):
        assert isinstance(self.request.user.id, int)
        return self.queryset.filter(id=self.request.user.id)

    @extend_schema(
        methods=["PATCH"],
        request=PreferencesSerializer,
        responses=UserSerializer,
    )
    @action(detail=False, methods=["get", "patch"])
    def me(self, request):
        """La personne connectée ; PATCH change son thème et sa langue (#347)."""
        if request.method == "PATCH":
            avant = {"theme": request.user.theme, "langue": request.user.langue}
            preferences = PreferencesSerializer(
                request.user,
                data=request.data,
                partial=True,
            )
            preferences.is_valid(raise_exception=True)
            preferences.save()
            apres = {"theme": request.user.theme, "langue": request.user.langue}
            if apres != avant:
                journaliser(
                    "utilisateur.preferences",
                    auteur=auteur_de(request),
                    objet_type="utilisateur",
                    objet_id=request.user.pk,
                    avant=avant,
                    apres=apres,
                )
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(status=status.HTTP_200_OK, data=serializer.data)
