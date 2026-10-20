# Documentation OptiBoul ERP

| Document                                                                                                             | Contenu                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Cahier des charges v5](specifications/OptiBoul_ERP_Cahier_des_charges_v5.md)                                        | Périmètre, profils, modules, règles R1–R22, optimisations O1–O18, paramètres |
| [Parcours utilisateurs et UX v3](specifications/OptiBoul_ERP_Parcours_utilisateurs_UX_v3.md)                         | Profils, parcours P0–P15, principes d'interface                              |
| [Backlog produit v2](specifications/OptiBoul_ERP_Backlog_produit_v2.md)                                              | 16 épopées, 86 récits, sprints S1–S13 : issues GitHub et tableau de projet   |
| [Spécification technique et architecture v3](specifications/OptiBoul_ERP_Specification_technique_Architecture_v3.md) | Monorepo, Django, PostgreSQL, API, applications web                          |
| [Design](design/README.md)                                                                                           | Export Claude Design : prototype cliquable et maquettes                      |
| [Décisions d'architecture](adr/README.md)                                                                            | ADR-01 à ADR-20                                                              |

> **Architecture : les ADR priment.** La spécification technique v3 décrit encore cinq applications web, `backend/` et `packages/`. Les décisions prises depuis font foi : `apps/api` (ADR-17), une seule application web `apps/web` à espaces selon le profil (ADR-18), pas d'application mobile (ADR-19), `apps/web` autonome (ADR-20).

La documentation technique de l'API (Sphinx, générée par Cookiecutter Django) est dans [`apps/api/docs`](../apps/api/docs).
