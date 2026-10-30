"""Dépôts réels des pertes et corrections."""

from __future__ import annotations

from optiboul.core.infrastructure.journal import journal
from optiboul.core.infrastructure.numeros import numeros
from optiboul.core.infrastructure.semaines import depot_semaines
from optiboul.stocks.application.saisies import Depots

from .stocks import stock

depots = Depots(
    stock=stock,
    semaines=depot_semaines,
    numeros=numeros,
    journal=journal,
)
