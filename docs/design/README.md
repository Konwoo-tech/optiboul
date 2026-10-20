# Design

Livrables de design d'OptiBoul ERP, versionnés avec le code pour servir de référence aux écrans.

| Dossier                            | Contenu                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`claude-design/`](claude-design/) | Export Claude Design décompressé : prototype cliquable « OptiBoul ERP v2 » (`*.dc.html` + `support.js`), cahier des charges associé, pièces jointes (`uploads/`) |

## Mettre à jour l'export

1. Décompresser l'archive exportée de Claude Design **dans** `docs/design/claude-design/`, en remplaçant l'ancien contenu (supprimer d'abord les fichiers retirés du design).
2. Ouvrir `claude-design/OptiBoul ERP v2.dc.html` dans un navigateur pour parcourir le prototype.
3. Committer avec un message `docs(design): …` qui dit ce qui a changé.

## Règles

- Les maquettes sont la référence visuelle, le [cahier des charges](../specifications/OptiBoul_ERP_Cahier_des_charges_v4.md) reste la référence fonctionnelle : en cas d'écart, le cahier des charges l'emporte et l'écart est signalé dans une issue.
- Les couleurs et la typographie du design sont implémentées une seule fois dans [`packages/ui`](../../packages/ui) et [`packages/utils`](../../packages/utils/src/couleurs.ts).
- Aucun code de production n'importe de fichier de ce dossier.
