# Documentation OptiBoul ERP

| Document                                                                                                             | Contenu                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Cahier des charges v5](specifications/OptiBoul_ERP_Cahier_des_charges_v5.md)                                        | Périmètre, profils, modules, règles R1–R22, optimisations O1–O18, paramètres |
| [Parcours utilisateurs et UX v3](specifications/OptiBoul_ERP_Parcours_utilisateurs_UX_v3.md)                         | Profils, parcours P0–P15, principes d'interface                              |
| [Backlog produit v2](specifications/OptiBoul_ERP_Backlog_produit_v2.md)                                              | 16 épopées, 86 récits, sprints S1–S13 : issues GitHub et tableau de projet   |
| [Spécification technique et architecture v4](specifications/OptiBoul_ERP_Specification_technique_Architecture_v4.md) | Monorepo, API Django, PostgreSQL, API REST, application web à espaces        |
| [Design](design/README.md)                                                                                           | Export Claude Design : prototype cliquable et maquettes                      |
| [Décisions d'architecture](adr/README.md)                                                                            | ADR-01 à ADR-21                                                              |

> **Architecture : les ADR priment.** La spécification technique v4 intègre les ADR-14 à ADR-21 et les récits ajoutés dans les issues (US-153 à US-171) : `apps/api` (ADR-17), une seule application web `apps/web` à espaces selon le profil (ADR-18), pas d'application mobile (ADR-19), `apps/web` autonome (ADR-20). Toute nouvelle décision prend la forme d'un ADR, reporté ensuite dans la spécification.

La documentation technique de l'API (Sphinx, générée par Cookiecutter Django) est dans [`apps/api/docs`](../apps/api/docs).

Exploitation : [restaurer une sauvegarde](restauration.md), [accès distant par le tunnel](acces-distant.md), [poste de confiance](poste-de-confiance.md), [connexion avec Google](connexion-google.md).

Intégration du front : [manques et écarts de l’API constatés à l’intégration](integration-api-ecarts.md) (document vivant, avec la procédure de démarrage local de l’API).
