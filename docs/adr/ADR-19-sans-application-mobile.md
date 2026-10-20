# ADR-19 · Pas d'application mobile

**Statut :** acceptée · 20 octobre 2026 · remplace [ADR-13](ADR-13-mobile-react-native.md)

## Contexte

L'application React Native `pilotage` (ADR-13) a été retirée par le porteur du projet. Le propriétaire et le gérant doivent pourtant suivre l'activité et décider à distance (parcours P11, O5).

## Décision

- Le dépôt ne contient plus que deux applications : `apps/api` et `apps/web`.
- **L'accès distant passe par l'application web**, ouverte depuis le téléphone par le tunnel (Cloudflare Tunnel ou Tailscale). L'entrée « remote » de Traefik expose l'application web, `/api`, `/accounts` et `/static`. L'admin Django et Flower restent inaccessibles de l'extérieur.
- Les requêtes venant du tunnel portent `X-OptiBoul-Entree: distante` : l'API y exige la double authentification à chaque connexion et refuse le code à 4 chiffres (CdC §4.1, R14 ; US-010, US-011).
- Les écrans utiles à distance (demandes, alertes, tableau de bord) doivent fonctionner sur une colonne, sur téléphone (parcours P11, étape 4).
- Les notifications sur téléphone (O5) passeront par SMS / WhatsApp via l'outbox (O15), et non par une application installée.

## Conséquences

- Un seul client à développer et à tester.
- Une PWA (installation de l'application web sur l'écran d'accueil, Web Push) reste possible plus tard, sans changer l'architecture.
