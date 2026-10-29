from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib import admin

from .infrastructure.models import LigneJournal

if TYPE_CHECKING:
    from django.http import HttpRequest


@admin.register(LigneJournal)
class LigneJournalAdmin(admin.ModelAdmin):
    """Lecture seule : le journal n'est jamais modifié (CdC §5.12)."""

    list_display = [
        "horodatage",
        "acteur_nom",
        "profil",
        "poste_nom",
        "entree",
        "action",
    ]
    list_filter = ["entree", "objet_type", "profil"]
    search_fields = ["action", "acteur_nom", "objet_id"]
    date_hierarchy = "horodatage"

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: object = None) -> bool:
        return False

    def has_delete_permission(self, request: HttpRequest, obj: object = None) -> bool:
        return False
