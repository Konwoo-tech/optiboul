# ADR-21 · Reste à produire et notifications par rafraîchissement court

**Statut :** acceptée · 20 octobre 2026 · décrite comme ADR-13 dans la spécification technique v3, renumérotée en v4 car ADR-13 désigne déjà l'application mobile (remplacée)

## Contexte

Le reste à produire (US-088) et le compteur de notifications (US-074) doivent être à jour sur les postes du comptoir, de l'atelier et de la gestion pendant la production.

## Décision

- Les écrans concernés rafraîchissent ces données **toutes les 15 s au plus** (TanStack Query, `refetchInterval`).
- Chaque saisie qui les modifie (fournée, livraison, décision…) invalide immédiatement les requêtes correspondantes.
- Pas de WebSocket (Django Channels) pour l'instant.

## Conséquences

- Suffisant pour quelques postes sur un réseau local, sans service supplémentaire à installer ni à surveiller.
- Django Channels reste possible si le besoin de temps réel augmente.
