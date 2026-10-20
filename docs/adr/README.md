# Décisions d'architecture (ADR)

ADR-01 à ADR-12 sont décrites dans la [spécification technique §12](../specifications/OptiBoul_ERP_Specification_technique_Architecture_v2.md#12-décisions-darchitecture-adr). Les décisions suivantes ont été prises à l'initialisation du dépôt.

| N°                                      | Décision                                                                          | Statut                                   |
| --------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| [ADR-13](ADR-13-mobile-react-native.md) | Application mobile `pilotage` en React Native (Expo) au lieu d'une PWA            | Acceptée                                 |
| [ADR-14](ADR-14-aws-mailgun.md)         | AWS S3 (médias, sauvegardes) et Mailgun (e-mails) via Cookiecutter Django         | Acceptée, à confirmer pour le hors-ligne |
| [ADR-15](ADR-15-versions-socle.md)      | Socle aligné sur le gabarit Cookiecutter Django courant : Django 6.0, Python 3.14 | Acceptée                                 |
| [ADR-16](ADR-16-outillage-front.md)     | oxlint, TypeScript 7, catalogue pnpm aligné sur la version de React d'Expo        | Acceptée                                 |
