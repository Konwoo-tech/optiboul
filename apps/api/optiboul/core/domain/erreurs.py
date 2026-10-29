"""Refus métier (spécification §6.1) : un code stable, un message pour l'écran."""

from __future__ import annotations


class RefusMetier(Exception):  # noqa: N818
    """Règle de gestion non respectée ; l'API la rend en { detail, code } (RFC 9457)."""

    def __init__(self, code: str, detail: str, **autres: object) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.autres = autres
