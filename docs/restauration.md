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

## 3 bis. Restaurer depuis l'écran Sauvegardes (#304, #359)

Pour une copie locale réussie encore présente sur le serveur, l'administrateur peut restaurer depuis l'écran Sauvegardes, sans ligne de commande :

1. `POST /api/v1/sauvegardes/{id}/restaurer/` avec l'en-tête `Idempotency-Key`. La réponse arrive une fois la restauration finie : l'API essaie la copie dans une base jetable, prend une copie de sûreté de la base actuelle (`genre: avant_restauration`), puis remplace la base en une seule transaction.
2. La réponse `200` donne `copie_avant`, la copie de sûreté, et `controles` : pour le nombre de caisses, la somme des soldes clients et le nombre de mouvements de stock, le total de la copie, celui de la base restaurée et `ok` s'ils sont égaux.
3. `GET /api/v1/sauvegardes/restaurations/{id}/` relit le même résultat pendant 30 jours.

Règles :

- Une seule restauration à la fois : `409 restauration_en_cours`. La même clé `Idempotency-Key` rejoue la réponse sans restaurer une seconde fois.
- Une copie cloud, en échec ou absente du disque n'est pas restaurable depuis l'écran (`409 restauration_impossible`) : passer par la commande ci-dessus. Un échec pendant la restauration répond aussi `409 restauration_impossible`, base inchangée.
- Les saisies faites pendant la restauration sont perdues : prévenir l'équipe et choisir un moment sans activité au comptoir. La session de l'administrateur peut être fermée par la restauration.
- La requête reste ouverte pendant toute la restauration : le serveur web accepte jusqu'à 10 minutes (`gunicorn --timeout 600`).
- Le résultat est gardé dans Redis, hors de la base qui est remplacée. La copie de sûreté et l'entrée `sauvegarde.restauree` du journal sont réécrites dans la base restaurée.

## 4. Reprendre

1. Redémarrer l'API et Celery.
2. Se connecter avec un compte gérant et vérifier la semaine ouverte, la dernière caisse et le stock.
3. Ressaisir ce qui a été fait depuis l'heure de la sauvegarde.

## Limites

- Tout ce qui a été saisi après la sauvegarde est perdu : la perte maximale est de 4 h avec la sauvegarde locale.
- La restauration d'un fichier d'une autre version de l'application demande ensuite `python manage.py migrate`.
