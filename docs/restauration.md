# Restaurer une sauvegarde

Procédure de reprise après panne (US-143). À dérouler une fois avant la mise en service, puis à chaque changement de serveur.

## 1. Trouver la sauvegarde

- Copie locale : dans le dossier `OPTIBOUL_DOSSIER_SAUVEGARDES`, fichier `.dump`.
- Copie cloud : le fichier `.chiffre` du compartiment S3. Il faut alors `OPTIBOUL_CLE_SAUVEGARDE`, conservée hors du serveur.

## 2. Essayer sans risque

```sh
python manage.py restaurer_sauvegarde /chemin/vers/le/fichier
```

La commande déchiffre si besoin, restaure dans une base jetable, affiche le nombre de lignes des tables témoins, puis supprime cette base. La base de travail n'est pas touchée. Un fichier modifié, tronqué ou illisible est refusé.

Vérifier que les nombres sont cohérents avec le dernier état connu.

## 3. Restaurer

Arrêter d'abord l'API et Celery, pour qu'aucune écriture ne se perde pendant la restauration. Puis :

```sh
python manage.py restaurer_sauvegarde /chemin/vers/le/fichier --confirmer REMPLACER-LA-BASE
```

La commande refait l'essai, crée une copie de sécurité `avant-restauration-*.dump` dans le dossier des sauvegardes, puis remplace la base de travail en une seule transaction. En cas d'échec, la base reste telle quelle.

## 4. Reprendre

1. Redémarrer l'API et Celery.
2. Se connecter avec un compte gérant et vérifier la semaine ouverte, la dernière caisse et le stock.
3. Ressaisir ce qui a été fait depuis l'heure de la sauvegarde.

## Limites

- Tout ce qui a été saisi après la sauvegarde est perdu : la perte maximale est de 4 h avec la sauvegarde locale.
- La restauration d'un fichier d'une autre version de l'application demande ensuite `python manage.py migrate`.
