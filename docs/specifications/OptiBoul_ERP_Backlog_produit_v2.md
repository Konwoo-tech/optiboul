# OptiBoul ERP — Backlog produit

**Boulangerie du Faubourg · Etoudi, Yaoundé**  
Version 2 · 20 octobre 2026  
Préparé par Dongmo Noukouankouang Baudouin

> Établi à partir du cahier des charges v5 et des parcours utilisateurs v3 (20 octobre 2026). Remplace la version 1 du 14 octobre. Document associé : Spécification technique et architecture v3.

## Sommaire

- [1. Conventions](#1-conventions)
- [2. Vue d'ensemble](#2-vue-densemble)
- [3. Récits utilisateurs par épopée](#3-récits-utilisateurs-par-épopée)
- [4. Plan de sprints indicatif](#4-plan-de-sprints-indicatif)
- [5. Jalons d'acceptation](#5-jalons-dacceptation)
- [6. Risques du backlog](#6-risques-du-backlog)

## 1. Conventions

Ce backlog traduit le cahier des charges v5 et les parcours utilisateurs v3 en **épopées** et **récits utilisateurs** prêts à être développés. Il ne contient aucun chiffrage financier.

| Élément | Convention |
| --- | --- |
| Identifiants | EPxx pour les épopées, US-xxx pour les récits ; la colonne Réf. renvoie au cahier des charges (§, R, O) ou à la spécification technique |
| Priorité (MoSCoW) | Must = indispensable au lot ; Should = important, peut glisser au sprint suivant ; Could = confort |
| Points | Complexité relative (suite 1, 2, 3, 5, 8, 13) ; un récit à 13 est découpé avant d'entrer en sprint |
| Lots | Lot 0 : socle technique · Lot 1 : ventes, dettes, production de base, fournisseurs, dépenses · Lot 2 : stocks et inventaires, consommation réelle, paie, marge |
| Sprint | 2 semaines, démonstration à la boulangerie en fin de sprint |

### Définition de « prêt »

- Le récit a une valeur claire pour un profil, des critères d'acceptation testables et une estimation ≤ 8 points.
- Les écrans concernés existent dans le prototype ou une maquette validée ; les règles et paramètres sont connus.

### Définition de « terminé »

- Code relu, tests unitaires du domaine et tests d'API au vert ; parcours Playwright mis à jour si le récit touche le comptoir.
- Droits vérifiés côté serveur pour chaque profil ; action tracée dans le journal ; textes FR et EN.
- Fonctionne hors ligne (sauf envois mis en file) ; migration de base réversible ; documentation OpenAPI à jour.
- Démontré au propriétaire ou au gérant et accepté.

## 2. Vue d'ensemble

| Épopée | Objectif | Lot | Récits | Points |
| --- | --- | --- | --- | --- |
| EP00 · Socle technique | Monorepo, CI, Docker, environnements, thème OptiBoul | 0 | 4 | 16 |
| EP01 · Authentification et sécurité | Connexion rapide au comptoir, double authentification ciblée (O1) | 1 | 6 | 26 |
| EP02 · Administration | Comptes, groupes, postes de confiance, paramètres, journal | 1 | 5 | 19 |
| EP03 · Semaines et planning | Rattacher toute l'activité à une semaine (O8, O9) | 1 | 6 | 23 |
| EP04 · Caisses | Une caisse par créneau, un seul comptage (O2, O4) | 1 | 5 | 16 |
| EP05 · Commandes et livraisons | Servir un client en moins de 30 s (O3) | 1 | 9 | 41 |
| EP06 · Clients et dettes | Dettes réglées avant dimanche (O11) | 1 | 5 | 17 |
| EP07 · Demandes et notifications | Décider vite, même à distance (O5) | 1 | 5 | 24 |
| EP08 · Production | Plan sans blocage, écarts justifiés (O6) | 1 | 10 | 45 |
| EP09 · Stocks et inventaires | Stock fiable, contrôlé deux fois par semaine (R16, O13) | 2 | 5 | 18 |
| EP10 · Fournisseurs et réceptions | Farine à crédit suivie, manquants jamais oubliés (O12) | 1 | 4 | 14 |
| EP11 · Dépenses et budget | Toutes les dépenses courantes, peu de validations (O7) | 1 | 4 | 14 |
| EP12 · Personnel et paie | Paie juste et tracée (O14) | 2 | 5 | 18 |
| EP13 · Tableau de bord et rapports | Décider en un coup d'œil (O10) | 1 · 2 | 5 | 23 |
| EP14 · Hors ligne, sauvegardes et file d'envoi | Rien ne dépend d'internet au comptoir (O15) | 1 | 5 | 18 |
| EP15 · Reprise et mise en service | Démarrer sans ressaisie | 1 | 3 | 11 |

| Lot | Récits | Points | Must | Should |
| --- | --- | --- | --- | --- |
| Lot 0 | 5 | 21 | 21 | 0 |
| Lot 1 | 69 | 274 | 241 | 33 |
| Lot 2 | 12 | 48 | 32 | 16 |
| Total | 86 | 343 | 294 | 49 |

## 3. Récits utilisateurs par épopée

### EP00 · Socle technique

**Objectif :** Monorepo, CI, Docker, environnements, thème OptiBoul. **Lot :** 0.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-001 | En tant qu'équipe, je veux un monorepo initialisé avec Cookiecutter Django (DRF, Celery, Docker) et une application React (Vite, TypeScript) afin de démarrer sur une base commune. | • `docker compose up` lance API, interface, PostgreSQL, Redis, Celery<br>• Tests et linters passent en CI sur une branche vide<br>• README de démarrage en moins de 10 étapes | Must | 5 | 0 | Spéc. §3 |
| US-002 | En tant qu'équipe, je veux une intégration continue (GitHub Actions) afin que chaque modification soit testée et construite. | • Lint, mypy, pytest, vitest, build Docker à chaque pull request<br>• Couverture publiée ; échec si couverture du domaine < 90 % | Must | 3 | 0 | Spéc. §11 |
| US-003 | En tant qu'équipe, je veux le client TypeScript généré depuis le schéma OpenAPI afin que l'interface et l'API restent alignées. | • `make api-client` régénère le client<br>• La CI échoue si le client n'est pas à jour | Must | 3 | 0 | Spéc. §6 |
| US-004 | En tant qu'utilisateur, je veux une interface aux couleurs OptiBoul (clair / sombre, FR / EN) afin de travailler dans un cadre lisible. | • Thème or / chocolat / crème, Manrope<br>• Bascule clair / sombre et FR / EN mémorisée par utilisateur<br>• Contraste AA vérifié | Must | 5 | 0 | CdC §8 |

### EP01 · Authentification et sécurité

**Objectif :** Connexion rapide au comptoir, double authentification ciblée (O1). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-010 | En tant que caissière, je veux me connecter en touchant mon nom puis un code à 4 chiffres sur le poste de confiance afin de prendre mon poste en quelques secondes. | • Liste des utilisateurs du poste<br>• Vérification au 4ᵉ chiffre<br>• 5 échecs → blocage 15 min, tracé | Must | 5 | 1 | O1, R14 |
| US-011 | En tant que gérant, je veux une double authentification par SMS ou WhatsApp à ma première connexion du jour et à chaque accès à distance afin de protéger mes autorisations. | • Code à 6 chiffres, 3 essais, renvoi après 30 s, bascule de canal<br>• Numéro masqué à l'écran | Must | 8 | 1 | O1 |
| US-012 | En tant qu'utilisateur sans réseau, je veux valider ma connexion avec une application d'authentification ou un code de secours afin de ne jamais être bloqué. | • TOTP compatible Google Authenticator<br>• 10 codes de secours à usage unique | Must | 5 | 1 | O1 |
| US-013 | En tant que propriétaire, je veux me connecter avec Google depuis mon téléphone afin d'accéder au logiciel à distance. | • Seuls les Gmail enregistrés sont acceptés<br>• Double authentification ensuite | Should | 3 | 1 | CdC §4 |
| US-014 | En tant qu'utilisateur, je veux « Changer d'utilisateur » sans perdre ma saisie afin de partager le poste du comptoir. | • Brouillon conservé pour son auteur<br>• Déconnexion automatique après l'inactivité paramétrée | Must | 3 | 1 | §4.2 |
| US-015 | En tant qu'utilisateur, je veux réinitialiser mon mot de passe afin de récupérer mon accès. | • Lien à durée limitée<br>• Tracé dans le journal | Should | 2 | 1 | — |

### EP02 · Administration

**Objectif :** Comptes, groupes, postes de confiance, paramètres, journal. **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-020 | En tant qu'administrateur, je veux créer un utilisateur en 3 étapes avec aperçu des accès afin d'éviter les erreurs de droits. | • Gmail unique, téléphone +237 à 9 chiffres commençant par 6<br>• Groupe obligatoire<br>• Invitation mise en file d'envoi | Must | 5 | 1 | §5.12 |
| US-021 | En tant qu'administrateur, je veux créer des groupes et changer un utilisateur de groupe afin d'ajuster les droits. | • Effet immédiat<br>• Changement tracé | Must | 3 | 1 | §3.2 |
| US-022 | En tant qu'administrateur, je veux enregistrer ou révoquer un poste de confiance afin de contrôler où le code à 4 chiffres est accepté. | • Jeton de poste signé, révocable | Must | 3 | 1 | O1 |
| US-023 | En tant que propriétaire, je veux modifier les paramètres métier afin d'ajuster plafonds et seuils. | • Tous les paramètres de la §9 du CdC<br>• Historique des valeurs | Must | 3 | 1 | CdC §9 |
| US-024 | En tant que propriétaire, je veux consulter le journal des actions filtrable afin de savoir qui a fait quoi. | • Filtres auteur, type, période<br>• Valeurs avant / après<br>• Journal non modifiable | Must | 5 | 1 | R1 |

### EP03 · Semaines et planning

**Objectif :** Rattacher toute l'activité à une semaine (O8, O9). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-030 | En tant que propriétaire, je veux planifier une semaine (gérant, responsable de production) et copier la semaine précédente afin de planifier en 2 minutes. | • Rotation proposée<br>• Conflits signalés | Must | 5 | 1 | O9 |
| US-031 | En tant que gérant, je veux le planning des caisses (7 jours × jour / nuit) afin que chaque créneau ait sa caissière. | • Une caissière par créneau<br>• Alerte si créneau vide | Must | 3 | 1 | §5.1 |
| US-032 | En tant que gérant, je veux que la semaine s'ouvre seule le lundi 06:00 si tout est prêt afin de ne pas bloquer l'activité. | • Tâche Celery Beat<br>• Alerte au propriétaire sinon | Must | 3 | 1 | O8, R2 |
| US-033 | En tant que gérant, je veux clôturer la semaine avec des contrôles bloquants et à voir afin de passer une semaine propre. | • Bloquants : caisse ouverte, production en cours<br>• Rappel dimanche 18:00<br>• Dettes reportées et marquées | Must | 5 | 1 | R3, R20 |
| US-034 | En tant que gérant suivant, je veux recevoir le rapport de passation en PDF afin de savoir ce que je reprends. | • Caisses, dettes, stock bas, incidents | Must | 5 | 1 | §5.1 |
| US-035 | En tant que propriétaire, je veux forcer une clôture avec motif afin de débloquer la semaine suivante. | • Objets ouverts archivés « non clôturés » | Should | 2 | 1 | O8 |

### EP04 · Caisses

**Objectif :** Une caisse par créneau, un seul comptage (O2, O4). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-040 | En tant que caissière, je veux ouvrir ma caisse en comptant le fonds afin de démarrer la session. | • Fonds 20 000 FCFA proposé<br>• Signalement si non planifiée | Must | 3 | 1 | §5.2 |
| US-041 | En tant que caissière, je veux remettre des espèces au coffre au-delà du plafond afin de limiter l'argent exposé. | • Proposition au-delà de 100 000 FCFA<br>• Receveur et heure tracés | Should | 3 | 1 | O4, R18 |
| US-042 | En tant que caissière, je veux fermer ma caisse avec un seul comptage afin d'obtenir l'écart immédiatement. | • Attendu = fonds + espèces − dépenses − remises<br>• Statut juste / manque / excédent<br>• Verrouillage et sauvegarde | Must | 5 | 1 | O2, R17 |
| US-043 | En tant que gérant, je veux rouvrir une caisse fermée avec un motif afin de corriger une erreur. | • Tracé, propriétaire informé | Must | 2 | 1 | R13 |
| US-044 | En tant que gérant, je veux l'historique et le récapitulatif par caissière afin de suivre les écarts. | • Une caissière ne voit que ses caisses | Should | 3 | 1 | §5.2 |

### EP05 · Commandes et livraisons

**Objectif :** Servir un client en moins de 30 s (O3). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-050 | En tant que caissière, je veux saisir les commandes et reprendre celles de la veille afin de préparer la session vite. | • Heure limite paramétrable<br>• Sacs à pétrir recalculés | Must | 5 | 1 | O3 |
| US-051 | En tant que caissière, je veux trouver un client par ses premières lettres et livrer comme commandé en une touche afin de réduire la saisie. | • Montant dû selon le tarif du client<br>• Solde après livraison affiché | Must | 8 | 1 | O3 |
| US-052 | En tant que caissière, je veux encaisser en espèces, MTN MoMo ou Orange Money, en partiel ou pour une ancienne dette afin de refléter le paiement réel. | • Référence obligatoire pour le mobile money<br>• Mouvement de compte dans la même transaction | Must | 5 | 1 | R7, R21 |
| US-053 | En tant que caissière, je veux être bloquée au-delà du plafond avec les actions possibles afin de ne pas laisser filer une dette. | • Encaisser le manque ou demander<br>• La file n'est pas bloquée | Must | 5 | 1 | R6 |
| US-054 | En tant que caissière, je veux le bon de livraison à l'écran, en PDF ou par WhatsApp afin de le remettre au client. | • Envoi en file si hors ligne | Must | 5 | 1 | O15 |
| US-055 | En tant que caissière, je veux saisir les mouvements internes avec motif afin que les totaux soient justes. | • Guichet, retours, reste en salle, ration | Must | 3 | 1 | §5.3 |
| US-056 | En tant que caissière, je veux naviguer entièrement au clavier afin de servir sans souris. | • Tab / Entrée, F2, F4, F8, Échap<br>• Test Playwright du parcours complet au clavier | Must | 3 | 1 | §7 |
| US-057 | En tant que caissière, je veux voir les clients habituels sans commande, qu'ils soient relancés automatiquement 30 min avant l'heure limite et reprendre leur commande habituelle en un clic afin d'avoir toutes les commandes à temps. | • Liste au-dessus des commandes, état du rappel<br>• Relance WhatsApp individuelle ou groupée via la file d'envoi<br>• Commande habituelle = moyenne des 4 dernières sessions du même type | Must | 5 | 1 | §5.3, O18, O3 |
| US-058 | En tant que chef de production, je veux être averti d'une commande ajoutée après la validation du plan afin d'ajuster la production. | • Notification au chef et au gérant<br>• Commande marquée « tardive » | Must | 2 | 1 | §5.3 |

### EP06 · Clients et dettes

**Objectif :** Dettes réglées avant dimanche (O11). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-060 | En tant que gérant, je veux gérer les fiches clients et leurs tarifs afin que chaque livraison soit facturée au bon prix. | • Type, téléphone, plafond propre, tarif par produit | Must | 5 | 1 | §5.4 |
| US-061 | En tant que gérant, je veux la liste des dettes avec jauge et statut afin de savoir qui relancer. | • Solde calculé depuis les mouvements | Must | 3 | 1 | R21 |
| US-062 | En tant que gérant, je veux relancer un ou plusieurs clients par WhatsApp afin d'obtenir le paiement avant dimanche. | • Relance groupée<br>• Statut d'envoi | Must | 3 | 1 | §5.4 |
| US-063 | En tant que gérant, je veux des relances automatiques jeudi et samedi afin de ne pas y penser. | • Jours et heure paramétrables | Should | 3 | 1 | O11 |
| US-064 | En tant que client livreur, je veux recevoir mon relevé afin de vérifier mon compte. | • PDF ou WhatsApp, historique | Should | 3 | 1 | §5.4 |

### EP07 · Demandes et notifications

**Objectif :** Décider vite, même à distance (O5). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-070 | En tant que caissière, je veux émettre une demande liée à l'objet bloqué afin d'obtenir une autorisation. | • DEM-xxx, objet lié, motif | Must | 5 | 1 | §5.9 |
| US-071 | En tant que gérant, je veux accorder ou refuser une demande depuis mon téléphone ou par code sur le poste afin de ne pas être obligé d'être présent. | • Refus motivé<br>• Objet mis à jour automatiquement | Must | 8 | 1 | O5 |
| US-072 | En tant que propriétaire, je veux recevoir les demandes non traitées à leur échéance afin qu'aucune ne reste en suspens. | • Échéances par type | Must | 3 | 1 | R19 |
| US-073 | En tant qu'utilisateur, je veux un centre de notifications regroupées afin de ne pas être noyé la nuit. | • Regroupement par type et par heure | Should | 3 | 1 | §5.13 |
| US-074 | En tant qu'utilisateur, je veux un centre de notifications avec compteur de non-lues, chaque notification ouvrant l'écran concerné et n'étant envoyée qu'aux rôles concernés, afin de ne voir que ce qui me concerne. | • Table de routage par type et par rôle (§5.13 du CdC)<br>• Envoi complémentaire SMS / WhatsApp selon le paramétrage | Must | 5 | 1 | §5.13 |

### EP08 · Production

**Objectif :** Plan sans blocage, écarts justifiés (O6). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-080 | En tant que responsable de production, je veux gérer les produits et fiches techniques afin que le plan soit calculé juste. | • Boule, pains par boule, pains par sac, recette par sac | Must | 5 | 1 | §5.5 |
| US-081 | En tant que responsable de production, je veux un plan calculé depuis les commandes et comparé aux dernières sessions afin de le proposer vite. | • Sacs, pains, boules par produit | Must | 5 | 1 | R4 |
| US-082 | En tant que gérant, je veux valider le plan ; sans réponse à T-15 min, validation automatique dans la tolérance ou démarrage provisoire afin que le pétrissage ne soit jamais retardé. | • Tolérance ± 10 % paramétrable<br>• Alerte « provisoire » | Must | 5 | 1 | O6 |
| US-083 | En tant que responsable de production, je veux ouvrir, saisir le réalisé et clôturer la production afin de suivre prévu et réalisé. | • Clôture impossible sans réalisé ni consommation | Must | 5 | 1 | R5 |
| US-084 | En tant que responsable de production, je veux saisir la consommation réelle avec la valeur théorique affichée et justifier les écarts afin d'expliquer les pertes. | • Seuil 2 kg / sac ou 4 %<br>• Gérant informé | Must | 5 | 2 | R10 |
| US-085 | En tant que gérant, je veux qu'une production non clôturée soit archivée et signalée afin de ne pas fausser les stocks. | • Statut « non clôturée », alerte | Should | 2 | 1 | §5.5 |
| US-086 | En tant que responsable de production, je veux un plan qui additionne commandes, demande estimée (habituels sans commande, guichet moyen des 4 dernières sessions) et supplément, chaque source affichée, afin de produire au plus juste. | • Alerte si la demande estimée dépasse le plan<br>• Moyenne paramétrable | Must | 5 | 1 | §5.5 |
| US-087 | En tant que responsable de production, je veux ajouter des sacs par produit avec un motif ; après validation, accord automatique sous le seuil ou demande au gérant, afin d'augmenter la production sans retard. | • Stock de farine affiché<br>• Seuil O17 paramétrable<br>• Accordé : plan et sorties de stock mis à jour, chef et caisse notifiés | Must | 5 | 1 | R15, O17 |
| US-088 | En tant que caissière, chef ou gérant, je veux voir le reste à produire par produit mis à jour à chaque fournée afin de savoir ce qui peut encore être livré. | • Saisie du réalisé par fournée<br>• Rafraîchissement ≤ 15 s sur les postes ouverts | Must | 3 | 1 | §5.5 |
| US-089 | En tant que propriétaire, je veux des fiches techniques versionnées avec coût de revient par pain, marge et procédé afin de connaître la rentabilité de chaque produit. | • Coût recalculé depuis les prix des matières<br>• Un plan validé garde sa version de fiche | Should | 5 | 2 | §5.5 |

### EP09 · Stocks et inventaires

**Objectif :** Stock fiable, contrôlé deux fois par semaine (R16, O13). **Lot :** 2.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-090 | En tant que gérant, je veux l'état du stock par matière avec sessions restantes et statut afin d'anticiper les achats. | • Suffisant / à commander / stock bas | Must | 5 | 2 | §5.6 |
| US-091 | En tant que système, je veux créer les sorties de stock à chaque clôture de production afin que le stock suive la réalité. | • Mouvements liés à la production | Must | 3 | 1 | R5 |
| US-092 | En tant que gérant, je veux saisir pertes, casse et corrections motivées afin de garder un stock juste. | • Motif obligatoire | Must | 2 | 2 | §5.6 |
| US-093 | En tant que gérant, je veux deux contrôles de stock obligatoires par semaine (mercredi après la production de jour, dimanche à la clôture) avec le responsable de production, guidés et à l'aveugle, afin de détecter les écarts tôt. | • Statuts prévu / à faire aujourd'hui / fait / manqué, rappel le jour même<br>• Mercredi : matières clés ; dimanche : toutes<br>• ≤ 5 % ajusté, > 5 % demande ; contrôle manqué en alerte | Must | 5 | 2 | R16, O13, R9 |
| US-094 | En tant que gérant, je veux le stock à date de n'importe quel jour avec les mouvements du jour et le dernier comptage afin de comprendre un écart. | • Calcul depuis le dernier inventaire validé + mouvements | Should | 3 | 2 | §5.6 |

### EP10 · Fournisseurs et réceptions

**Objectif :** Farine à crédit suivie, manquants jamais oubliés (O12). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-100 | En tant que gérant, je veux gérer les fournisseurs et planifier les réceptions afin d'anticiper les livraisons. | • Matières, conditions, prochaine réception | Must | 3 | 1 | §5.7 |
| US-101 | En tant que gérant, je veux réceptionner depuis la réception planifiée afin de saisir en un clic. | • Entrée de stock et facture créées<br>• Farine cumulée sur la facture de la semaine | Must | 5 | 1 | O12 |
| US-102 | En tant que gérant, je veux que tout écart crée un manquant relançable ou replanifiable afin de récupérer ce qui est dû. | — | Should | 3 | 1 | R11 |
| US-103 | En tant que gérant, je veux payer une facture et obtenir un reçu afin de solder la dette fournisseur. | • Espèces, banque, mobile money<br>• Dépense rattachée au stock | Must | 3 | 1 | §5.7 |

### EP11 · Dépenses et budget

**Objectif :** Toutes les dépenses courantes, peu de validations (O7). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-110 | En tant que caissière ou gérant, je veux saisir une dépense avec photo et rattachement afin qu'elle soit justifiée et comptée. | • DEP-xxxx, semaine, rattachement obligatoire<br>• Entrée de stock si matière | Must | 5 | 1 | §5.8 |
| US-111 | En tant que gérant, je veux pré-autoriser les achats courants de la semaine afin d'éviter une demande à chaque achat. | • Plafond par catégorie | Must | 3 | 1 | O7 |
| US-112 | En tant que propriétaire, je veux que les dépenses au-dessus du seuil hors pré-autorisation me soient soumises afin de garder le contrôle. | • Gérant pour la caisse, propriétaire pour le gérant | Must | 3 | 1 | R8 |
| US-113 | En tant que propriétaire, je veux un budget mensuel par catégorie avec statut afin de voir les dépassements. | • OK / à surveiller (80 %) / dépassé | Must | 3 | 1 | §5.8 |

### EP12 · Personnel et paie

**Objectif :** Paie juste et tracée (O14). **Lot :** 2.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-120 | En tant que gérant, je veux les fiches employés et un brouillon de paie pré-calculé afin de préparer la paie vite. | • Net = base − absences − avances − pénalités + gains + impayé<br>• Absence = base ÷ 26 | Must | 5 | 2 | §5.10 |
| US-121 | En tant que gérant, je veux des absences proposées depuis le planning afin de ne rien oublier. | • À confirmer ou corriger | Should | 3 | 2 | O14 |
| US-122 | En tant que gérant, je veux ajouter gains et pénalités multiples motivés afin d'ajuster chaque net. | • Modifiables en brouillon seulement | Must | 3 | 2 | §5.10 |
| US-123 | En tant que propriétaire, je veux valider l'état de paie afin d'autoriser le paiement. | • Demande liée | Must | 2 | 2 | §5.9 |
| US-124 | En tant que gérant, je veux payer individuellement ou tous les restes, en partiel, et obtenir les bulletins afin de solder la paie. | • Dépenses « Salaires » créées<br>• Impayés reportés | Must | 5 | 2 | R12 |

### EP13 · Tableau de bord et rapports

**Objectif :** Décider en un coup d'œil (O10). **Lot :** 1 · 2.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-130 | En tant qu'utilisateur, je veux un accueil selon mon profil afin d'aller droit à ma tâche. | • Ma caisse, Plan du jour, Ma semaine, Tableau de bord | Must | 5 | 1 | O10 |
| US-131 | En tant que propriétaire, je veux les indicateurs et graphiques du mois afin de suivre la rentabilité. | • Recette, taux d'encaissement, dettes, écart de caisse | Must | 5 | 1 | §5.11 |
| US-132 | En tant que gérant, je veux des alertes cliquables jusqu'au détail afin de traiter les anomalies. | • Les 10 types d'alertes du CdC | Must | 5 | 1 | §5.11 |
| US-133 | En tant que propriétaire, je veux exporter les rapports de session, semaine et mois en PDF et Excel afin de les archiver. | — | Should | 3 | 1 | §7 |
| US-134 | En tant que propriétaire, je veux la marge estimée (recette − matières − charges) afin de connaître la rentabilité réelle. | • Coût matières issu des sorties de stock valorisées | Should | 5 | 2 | §5.11 |

### EP14 · Hors ligne, sauvegardes et file d'envoi

**Objectif :** Rien ne dépend d'internet au comptoir (O15). **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-140 | En tant qu'utilisateur, je veux voir l'état en ligne / hors ligne et les envois en attente afin de savoir ce qui partira. | — | Must | 2 | 1 | R22 |
| US-141 | En tant que système, je veux une file d'envoi (outbox) rejouée au retour du réseau afin qu'aucun SMS, WhatsApp ou copie ne soit perdu. | • Tentatives avec délai croissant<br>• Statut en attente / envoyé / échec | Must | 5 | 1 | O15 |
| US-142 | En tant qu'administrateur, je veux une sauvegarde locale toutes les 4 h et à chaque clôture, et une copie cloud chiffrée afin de protéger les données. | • Alerte au-delà de 48 h sans copie cloud | Must | 5 | 0 | §5.12 |
| US-143 | En tant qu'administrateur, je veux une restauration guidée testée afin de repartir après une panne. | • Procédure testée avant mise en service | Must | 3 | 1 | §5.12 |
| US-144 | En tant que propriétaire, je veux accéder à distance par un tunnel sécurisé afin de consulter et valider hors de la boulangerie. | — | Should | 3 | 1 | Spéc. §8 |

### EP15 · Reprise et mise en service

**Objectif :** Démarrer sans ressaisie. **Lot :** 1.

| ID | Récit | Critères d'acceptation | Prio. | Pts | Lot | Réf. |
| --- | --- | --- | --- | --- | --- | --- |
| US-150 | En tant qu'administrateur, je veux importer clients, tarifs et soldes depuis le classeur Excel afin de démarrer avec l'existant. | • Rapport des lignes rejetées<br>• Dettes > plafond signalées | Must | 5 | 1 | CdC §11 |
| US-151 | En tant que boulangerie, je veux une semaine de fonctionnement en parallèle de l'Excel afin de valider les totaux avant bascule. | • Totaux identiques à l'Excel | Must | 3 | 1 | — |
| US-152 | En tant qu'utilisateur, je veux un guide et une formation par profil afin d'être autonome. | • Guide PDF par profil | Must | 3 | 1 | — |

## 4. Plan de sprints indicatif

Hypothèse : une capacité de **30 points par sprint de 2 semaines**, à recaler après les deux premiers sprints. Les récits « Should » d'un lot passent après ses « Must » ; un lot ne commence que lorsque le précédent est accepté.

| Sprint | Lot | Objectif | Récits | Points |
| --- | --- | --- | --- | --- |
| S1 | 0 | Socle technique, Hors ligne, sauvegardes et file d'envoi | US-001, US-002, US-003, US-004, US-142 | 21 |
| S2 | 1 | Authentification et sécurité, Administration | US-010, US-011, US-012, US-014, US-020, US-021 | 29 |
| S3 | 1 | Administration, Semaines et planning | US-022, US-023, US-024, US-030, US-031, US-032, US-033 | 27 |
| S4 | 1 | Semaines et planning, Caisses, Commandes et livraisons | US-034, US-040, US-042, US-043, US-050, US-051 | 28 |
| S5 | 1 | Commandes et livraisons | US-052, US-053, US-054, US-055, US-056, US-057, US-058 | 28 |
| S6 | 1 | Clients et dettes, Demandes et notifications | US-060, US-061, US-062, US-070, US-071, US-072 | 27 |
| S7 | 1 | Demandes et notifications, Production | US-074, US-080, US-081, US-082, US-083, US-086 | 30 |
| S8 | 1 | Production, Stocks et inventaires, Fournisseurs et réceptions, Dépenses et budget | US-087, US-088, US-091, US-100, US-101, US-103, US-110, US-111 | 30 |
| S9 | 1 | Dépenses et budget, Tableau de bord et rapports, Hors ligne, sauvegardes et file d'envoi | US-112, US-113, US-130, US-131, US-132, US-140, US-141 | 28 |
| S10 | 1 | Hors ligne, sauvegardes et file d'envoi, Reprise et mise en service, Authentification et sécurité, Semaines et planning, Caisses, Clients et dettes | US-143, US-150, US-151, US-152, US-013, US-015, US-035, US-041, US-044, US-063 | 30 |
| S11 | 1 | Clients et dettes, Demandes et notifications, Production, Fournisseurs et réceptions, Tableau de bord et rapports, Hors ligne, sauvegardes et file d'envoi | US-064, US-073, US-085, US-102, US-133, US-144 | 17 |
| S12 | 2 | Production, Stocks et inventaires, Personnel et paie | US-084, US-090, US-092, US-093, US-120, US-122, US-123 | 27 |
| S13 | 2 | Personnel et paie, Production, Stocks et inventaires, Tableau de bord et rapports | US-124, US-089, US-094, US-121, US-134 | 21 |

Soit **13 sprints** : 1 pour le lot 0, 10 pour le lot 1, 2 pour le lot 2. La semaine de fonctionnement en parallèle de l'Excel (US-151) clôt le lot 1 avant la bascule.

## 5. Jalons d'acceptation

| Jalon | Critère | Qui valide |
| --- | --- | --- |
| Fin du lot 0 | Application installée sur le poste, connexion, thème, sauvegarde restaurée avec succès | Administrateur + propriétaire |
| Démonstration caisse | Une session complète (P3) au clavier en recette, livraison < 30 s | Caissière + gérant |
| Fin du lot 1 | Une semaine complète menée dans OptiBoul, totaux identiques à l'Excel, passation générée | Propriétaire |
| Fin du lot 2 | Paie d'un mois et inventaire mensuel validés, marge affichée | Propriétaire |

## 6. Risques du backlog

| Risque | Effet | Parade |
| --- | --- | --- |
| Passerelle SMS / WhatsApp non choisie | US-011, US-054, US-062 bloqués | Choisir le fournisseur avant le sprint 2 ; TOTP et codes de secours disponibles d'abord |
| PC du comptoir trop juste | Lenteur, Docker instable | Vérifier en lot 0 ; mini-PC dédié sinon |
| Seuils non confirmés | Règles à reprendre | Tous les seuils sont des paramètres (US-023) |
| Données Excel incohérentes | Reprise retardée | Import avec rapport d'erreurs (US-150) dès le lot 1 |
