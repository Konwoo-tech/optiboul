# Design

Livrables de design d'OptiBoul ERP, versionnés avec le code pour servir de référence aux écrans.

## Export Claude Design (`claude-design/`)

Export décompressé tel quel, sans modification (export du 20/10/2026).

| Fichier | Contenu |
| --- | --- |
| [`OptiBoul ERP v2.dc.html`](claude-design/OptiBoul%20ERP%20v2.dc.html) | **Prototype cliquable de référence** (v2) : tous les profils et parcours |
| [`OptiBoul ERP.dc.html`](claude-design/OptiBoul%20ERP.dc.html) | Première version du prototype, conservée pour l'historique |
| [`support.js`](claude-design/support.js) | Moteur d'exécution des prototypes, chargé par les deux fichiers `.dc.html` |
| [`OptiBoul ERP - Cahier des charges.md`](claude-design/OptiBoul%20ERP%20-%20Cahier%20des%20charges.md) | Cahier des charges rédigé dans Claude Design pour le prototype |
| [`uploads/`](claude-design/uploads/) | Pièces fournies à Claude Design : analyse des besoins v2, profils et parcours UX (chaque fichier y figure deux fois, copies identiques créées par l'export) |

**Ouvrir le prototype** : ouvrir `claude-design/OptiBoul ERP v2.dc.html` dans un navigateur (connexion internet nécessaire pour les polices et les bibliothèques chargées depuis Google Fonts et unpkg). Les comptes affichés sur l'écran de connexion sont fictifs (données de démonstration, cahier des charges §10).

## Mettre à jour l'export

1. Décompresser l'archive exportée de Claude Design **dans** `docs/design/claude-design/`, en remplaçant l'ancien contenu (supprimer d'abord les fichiers retirés du design). Rien d'autre que ce README ne vit directement dans `docs/design/`.
2. Ouvrir `claude-design/OptiBoul ERP v2.dc.html` dans un navigateur pour parcourir le prototype.
3. Committer sur une branche issue de `develop` avec un message `docs(design): …` qui dit ce qui a changé, puis ouvrir une pull request vers `develop`.

## Règles

- Les maquettes sont la référence visuelle, le [cahier des charges](../specifications/OptiBoul_ERP_Cahier_des_charges_v5.md) reste la référence fonctionnelle : en cas d'écart, le cahier des charges l'emporte et l'écart est signalé dans une issue.
- Les couleurs et la typographie du design sont implémentées une seule fois dans [`apps/web/src/ui`](../../apps/web/src/ui) et [`apps/web/src/utils`](../../apps/web/src/utils/couleurs.ts).
- Aucun code de production n'importe de fichier de ce dossier.
