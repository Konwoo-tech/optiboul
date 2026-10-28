# Décisions d'architecture (ADR)

ADR-01 à ADR-12 sont décrites dans la [spécification technique §12](../specifications/OptiBoul_ERP_Specification_technique_Architecture_v4.md#12-décisions-darchitecture-adr). Les décisions suivantes ont été prises à l'initialisation du dépôt.

| N°                                          | Décision                                                                            | Statut                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| [ADR-13](ADR-13-mobile-react-native.md)     | Application mobile `pilotage` en React Native (Expo) au lieu d'une PWA              | Remplacée par ADR-19                     |
| [ADR-14](ADR-14-aws-mailgun.md)             | AWS S3 (médias, sauvegardes) et Mailgun (e-mails) via Cookiecutter Django           | Acceptée, à confirmer pour le hors-ligne |
| [ADR-15](ADR-15-versions-socle.md)          | Socle aligné sur le gabarit Cookiecutter Django courant : Django 6.0, Python 3.14   | Acceptée                                 |
| [ADR-16](ADR-16-outillage-front.md)         | oxlint, TypeScript 7, Node 24                                                       | Acceptée                                 |
| [ADR-17](ADR-17-structure-apps.md)          | Toutes les applications sous `apps/` : `api`, `web`                                 | Acceptée                                 |
| [ADR-18](ADR-18-application-web-unique.md)  | Une seule application web ; les espaces dépendent du profil de l'utilisateur        | Acceptée, remplace ADR-10 pour le web    |
| [ADR-19](ADR-19-sans-application-mobile.md) | Pas d'application mobile : l'accès distant passe par l'application web              | Acceptée                                 |
| [ADR-20](ADR-20-web-autonome.md)            | `apps/web` autonome : plus d'espace de travail pnpm, de Turborepo ni de `packages/` | Acceptée, remplace ADR-12                |
| [ADR-21](ADR-21-rafraichissement-court.md)  | Reste à produire et notifications par rafraîchissement court (≤ 15 s)               | Acceptée (ADR-13 de la spécification v3) |
