# ADR-13 · Application mobile en React Native (Expo)

**Statut :** acceptée · 20 octobre 2026

## Contexte

La spécification v2 prévoit `pilotage` comme une PWA (§9.1). Le porteur du projet a demandé que toute partie mobile soit développée en React Native.

## Décision

- `apps/pilotage` est une application **Expo (SDK 58) + Expo Router**, en TypeScript.
- Elle partage avec le web les paquets sans dépendance au DOM : `@optiboul/api-client` (client fetch généré), `@optiboul/i18n`, `@optiboul/utils` (FCFA, créneaux, couleurs). `@optiboul/ui` (Mantine) et `@optiboul/auth` (cookies du navigateur) restent propres au web.
- L'API est atteinte par le tunnel sur l'entrée « remote » de Traefik, qui n'expose que `/api`. Le préfixe web `/pilotage` disparaît.
- Authentification mobile : la session par cookie du navigateur ne s'applique pas. Elle sera réalisée avec le client « app » de **django-allauth headless** (jeton de session, double authentification), dans US-013 / US-071.
- Notifications : Expo Notifications (APNs / FCM) en remplacement de Web Push, passées par l'outbox (O15).

## Conséquences

- Distribution par EAS Build / stores (ou APK interne) au lieu d'une installation depuis le navigateur.
- La version de React est imposée par le SDK Expo : le catalogue pnpm aligne les applications web dessus (ADR-16).
