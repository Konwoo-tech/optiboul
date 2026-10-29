"""Formats du CdC §7 : FCFA sans décimale, séparateur des milliers."""

from django import template

register = template.Library()

ESPACE_FINE = chr(0x202F)  # espace fine insécable


@register.filter
def fcfa(montant: int | None) -> str:
    """20000 → « 20 000 FCFA » ; un écart négatif garde son signe."""
    if montant is None:
        return "—"
    chiffres = f"{abs(int(montant)):,}".replace(",", ESPACE_FINE)
    signe = "−" if montant < 0 else ""  # noqa: RUF001 : signe moins typographique
    return f"{signe}{chiffres}{ESPACE_FINE}FCFA"
