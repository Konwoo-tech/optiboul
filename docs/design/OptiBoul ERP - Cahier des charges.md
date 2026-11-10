# OptiBoul ERP — Cahier des charges

Version 4 · 20 octobre 2026
Boulangerie du Faubourg · Etoudi, Yaoundé

Document de référence pour la conception et le développement d'OptiBoul ERP. Il décrit le contexte, les profils, les règles de gestion et chaque module tel qu'il est représenté dans le prototype cliquable (`OptiBoul ERP v2.dc.html`).

---

## 1. Contexte et objectifs

La boulangerie fonctionne en deux sessions par jour (jour 06:00–18:00, nuit 18:00–06:00). Elle livre des clients livreurs, des restaurants et des hôtels, souvent à crédit. La gestion est assurée par un **gérant qui change chaque semaine**, sous le contrôle du propriétaire.

Objectifs :

1. Saisir les livraisons et encaissements rapidement, au comptoir, sans erreur de calcul.
2. Maîtriser les dettes clients (plafond, échéance du dimanche).
3. Planifier la production à partir des commandes et contrôler la consommation des matières.
4. Suivre le stock, les fournisseurs, les réceptions et les dettes fournisseurs.
5. Rattacher chaque opération (caisse, production, dépense, réception) à une **semaine** et à des **responsables identifiés**.
6. Préparer, valider et payer la paie dans le système.
7. Tracer toutes les actions (qui, quand, quoi) et sécuriser l'accès.

---

## 2. Périmètre

| Inclus | Exclu (hors version 1) |
|---|---|
| Connexion sécurisée, rôles et groupes | Comptabilité générale (bilan, TVA) |
| Semaines, caisses, sessions, livraisons | Paiement mobile money intégré (API) |
| Production, stocks, fournisseurs | Application client final |
| Dépenses, budget, demandes de validation | Multi-boulangeries |
| Paie mensuelle | |
| Tableau de bord, journal, sauvegardes | |

---

## 3. Profils et groupes d'utilisateurs

### 3.1 Profils de droits

| Profil | Rôle principal |
|---|---|
| **Caissier / caissière** | Ouvre et ferme sa caisse, saisit commandes, livraisons, encaissements, mouvements internes et dépenses de caisse |
| **Gérant de la semaine** | Pilote la semaine : valide le plan de production, autorise les dépassements, planifie les réceptions, paie les fournisseurs, prépare et paie la paie, clôture la semaine |
| **Chef / responsable de production** | Propose le plan, ouvre et clôture la production, saisit le réalisé et la consommation, fait les inventaires |
| **Propriétaire** | Planifie les semaines et les affectations, valide les dépenses du gérant, la paie et les inventaires avec écart |
| **Administrateur** | Comptes, groupes, sauvegardes, paramètres |

### 3.2 Groupes d'utilisateurs

Un utilisateur appartient à **un groupe**. Le groupe porte le profil de droits.

Groupes de départ :
- Caisse – équipe de nuit
- Caisse – équipe de jour
- Gérants de la semaine
- Production
- Direction
- Support informatique

L'administrateur peut créer un groupe (nom, profil de droits, description) et changer un utilisateur de groupe. Ses droits changent alors immédiatement, et le changement est tracé dans le journal.

### 3.3 Matrice des droits (extrait)

| Fonction | Caissier | Gérant | Chef prod. | Propriétaire | Admin |
|---|---|---|---|---|---|
| Ouvrir / fermer une caisse | Oui | Oui | — | — | — |
| Livraisons et encaissements | Saisir | Saisir | — | Voir | — |
| Livraison au-delà du plafond | Demander | Autoriser | — | Autoriser | — |
| Planifier une semaine, affecter gérant et resp. production | — | — | — | Oui | — |
| Ouvrir une semaine | — | Gérant affecté | — | Oui | — |
| Clôturer une semaine | — | Gérant de la semaine | — | Oui | — |
| Proposer / ouvrir / clôturer la production | — | — | Responsable de la semaine | — | — |
| Valider le plan de production | — | Gérant de la semaine | — | Oui | — |
| Réceptions fournisseurs, paiement fournisseurs | — | Oui | — | Voir | — |
| Inventaire de stock | — | Oui | Oui | Valider si écart | — |
| Dépenses | Saisir | Saisir et valider | — | Valider | — |
| Paie | — | Préparer et payer | — | Valider | — |
| Comptes, groupes, sauvegardes | — | — | — | — | Oui |

---

## 4. Connexion et sécurité

### 4.1 Méthodes de connexion
- **Continuer avec Google** (compte Gmail enregistré par l'administrateur).
- **E-mail et mot de passe**, avec « Afficher le mot de passe » et « Mot de passe oublié ».
- Option de configuration : **nom et code à 4 chiffres** (poste partagé du comptoir).

### 4.2 Double authentification (obligatoire par défaut)
- Après la première étape, un code à 6 chiffres est envoyé par **SMS** ou **WhatsApp** au numéro du compte (affiché masqué : `+237 6 •• •• 45 10`).
- Le code est vérifié dès que les 6 chiffres sont saisis.
- Renvoi possible après 30 secondes, ou bascule vers l'autre canal.
- **3 essais** au maximum, puis un nouveau code est obligatoire.
- Le canal par défaut est défini à la création du compte.

### 4.3 Règles de session
- Déconnexion automatique après inactivité (1, 5, 10 ou 15 min, paramétrable).
- Bouton « Changer d'utilisateur » toujours visible.
- Chaque connexion est tracée avec la méthode et le canal de vérification.

### 4.4 Écran de connexion
- Heure, session en cours, gérant de la semaine, état en ligne / hors ligne.
- Profils de démonstration cliquables qui remplissent le formulaire (prototype uniquement).
- Langue **FR / EN** et thème **Clair / Sombre**.

---

## 5. Modules fonctionnels

### 5.1 Semaines de travail

La semaine est l'**unité de rattachement** de toute l'activité.

**Cycle de vie** : Planifiée → Ouverte → Clôturée

| Étape | Qui | Conditions |
|---|---|---|
| Planification et affectations | Propriétaire | Choisit le gérant de la semaine et le responsable de production |
| Planning des caisses | Propriétaire ou gérant | Une caissière par créneau (7 jours × jour/nuit) |
| Ouverture | Propriétaire ou gérant affecté | Semaine précédente clôturée, gérant et responsable affectés |
| Clôture | Gérant de la semaine ou propriétaire | Aucune caisse ouverte, aucune production en cours |

**Contrôles avant clôture** :
- Bloquants : caisse ouverte, production non clôturée.
- À voir : dettes clients, factures fournisseurs en retard, demandes en attente.

**Rapport de passation**, envoyé au gérant de la semaine suivante :
- Caisses : dernière fermeture, écart cumulé.
- Dettes : clients et fournisseurs.
- Stock bas.
- Incidents : écarts matière, demandes en attente, réouvertures de caisse.

**Rattaché à la semaine** : ouvertures/fermetures de caisse, productions, dépenses, réceptions fournisseurs, avec des indicateurs (recette, dépenses, sacs produits, écart de caisse cumulé).

### 5.2 Caisses : ouvertures et fermetures

- **Ouverture** : la caissière compte le fonds de caisse (20 000 FCFA par défaut). Le système affiche la caissière planifiée. Si une autre personne ouvre, l'ouverture est signalée dans le journal.
- **Fermeture** : la caissière compte les espèces. Le système calcule l'écart : fonds + espèces encaissées − dépenses de caisse.
- **Historique** par jour et par caissière : ouverture (heure, par qui), fermeture, fonds, attendu, compté, écart, statut (juste / manque / excédent).
- **Récapitulatif par caissière** : nombre d'ouvertures et de fermetures, recette, écart cumulé.
- Une caisse fermée ne peut être rouverte que par le gérant ou le propriétaire. La correction est tracée.
- Une caissière ne voit que ses propres caisses.

### 5.3 Session en cours : commandes, livraisons, clôture

- **Commandes** par client et par produit (BAG, KO, GC 135). Elles calculent les sacs à pétrir.
- **Livraison** :
  - recherche du client par les premières lettres, puis Entrée ;
  - quantités, montant dû calculé selon le tarif propre au client ;
  - mode de paiement (espèces, MTN MoMo, Orange Money) ; la référence est obligatoire pour le mobile money ;
  - montant reçu, reste, solde après livraison ;
  - bon de livraison en PDF ou envoyé par WhatsApp.
- **Plafond de dette** (2 000 FCFA par défaut) :
  - au-delà, la livraison est bloquée ;
  - la caissière peut encaisser la somme manquante ou demander l'autorisation du gérant, qui saisit son code sur le poste.
- **Relance des clients habituels** : la liste des clients qui commandent d'habitude à cette session et n'ont pas encore commandé s'affiche au-dessus des commandes. La caissière les relance par WhatsApp (un par un ou tous) ou reprend leur commande habituelle s'ils confirment par téléphone. Une commande ajoutée après la validation du plan est signalée au chef et au gérant.
- **Mouvements internes** : vente au guichet, retours, reste en salle, ration. Le motif est obligatoire.
- **Clôture** : récapitulatif, comptage, écart, confirmation, puis verrouillage.

### 5.4 Clients et dettes

- Solde de chaque client, jauge par rapport au plafond, statut (à jour / dette / plafond dépassé).
- Règle : toute dette est réglée au plus tard le dimanche.
- Relance WhatsApp, individuelle ou groupée.
- Relevé client en PDF ou par WhatsApp, avec l'historique des opérations.

### 5.5 Production

**Cycle par session** : Commandes → Plan proposé → Plan validé → Production ouverte → Production clôturée

| Étape | Qui | Quand (nuit / jour) |
|---|---|---|
| Commandes | Caissière de la session | Jusqu'à 18:30 / 05:30 |
| Plan proposé | Responsable de production de la semaine | Vers 18:45 / 05:45 |
| Plan validé | Gérant de la semaine | Avant le pétrissage |
| Production ouverte | Responsable de production | Vers 19:00 / 06:30 |
| Production clôturée | Responsable de production | Vers 05:00 / 13:30 |

- **Plan de production** calculé depuis les commandes :
  - sacs par produit, pains prévus, boules ;
  - pains par sac : BAG 315, KO 426, GC 135 216.
- **Origine de la demande** : le plan additionne trois sources :
  1. les commandes clients, saisies par la caissière dans Session → Commandes ;
  2. la demande estimée (clients habituels sans commande, ventes au guichet en moyenne sur les 4 dernières sessions du même type) ;
  3. le supplément décidé par le chef de production.
- **Augmentation de production** : le chef compare commandes, demande estimée et plan, puis ajoute des sacs par produit avec un motif obligatoire (clients habituels, guichet, marché ou événement, commande tardive). Le stock de farine disponible est affiché.
  - Avant validation du plan, le supplément s'ajoute au plan et est validé avec lui.
  - Après validation, il devient une demande au gérant de la semaine ; une fois accordée, il s'ajoute au plan et aux sorties de stock.
- **Reste à produire** : pendant la production, prévu − réalisé par produit, mis à jour à chaque fournée saisie et visible par le chef, le gérant et la caisse.
- **Fiche technique produit** (accessible depuis le plan et les paramètres) : ingrédients pour un sac de 50 kg, rendement (poids de boule, pains par boule, pains par sac), coût de revient par pain, marge, procédé. Modifiable par le propriétaire et l'administrateur, avec versions tracées.
- **Production réalisée** : saisie des pains réellement produits ; écart en pains et en pourcentage.
- **Consommation réelle** (farine, sel, levure, améliorant, glace, bois, huile) :
  - la valeur théorique de la recette est affichée à côté de chaque champ ;
  - au-delà de **2 kg d'écart par sac travaillé**, le chef doit justifier (perte, raté, brûlé, erreur de pesée, autre) et le gérant est informé.
- **Clôture** : impossible sans le réalisé et la consommation. Elle crée automatiquement les **sorties de stock**.
- **Historique** par semaine : responsable, validateur, heures, sacs, prévu/réalisé, écart matières, statut.
- Une production non clôturée à l'ouverture de la session suivante est archivée « non clôturée » et remonte en alerte.

### 5.6 Stocks

- **État du stock** par matière :
  - quantité, besoin par session, nombre de sessions restantes ;
  - prochaine réception planifiée, valeur ;
  - statut : suffisant / à commander / stock bas.
- **Entrées** :
  - réceptions fournisseurs ;
  - achats en caisse rattachés au stock ;
  - corrections manuelles.
- **Sorties** :
  - clôture de chaque production ;
  - pertes et casse (motif obligatoire).
- **Stock à date** : stock au soir de n'importe quel jour, avec les entrées, sorties et ajustements du jour et le dernier comptage physique. Calculé à partir du dernier inventaire validé et des mouvements enregistrés depuis.
- **Contrôles obligatoires deux fois par semaine** : le mercredi après la production de jour et le dimanche à la clôture de la semaine, par le gérant de la semaine avec le responsable de production. Statuts : prévu, à faire aujourd'hui, fait, manqué. Un rappel est envoyé le jour du contrôle.
- **Inventaires (audits)** :
  - comptage physique de chaque matière, comparé au stock théorique ;
  - écart ≤ 5 % : stock ajusté immédiatement ;
  - écart > 5 % : demande de validation au propriétaire, puis ajustement après accord ;
  - historique avec auteur, validateur et écarts.

### 5.7 Fournisseurs et réceptions

- **Fiche fournisseur** : matières, téléphone, conditions de paiement, dette, prochaine réception, manquants.
- **Planification des réceptions** par le gérant : fournisseur, matière, quantité, date prévue.
- **Réception** :
  - comptage de la quantité réellement livrée, observation ;
  - crée une entrée de stock et une facture (la farine est cumulée sur la facture de la semaine).
- **Manquant à livrer** : une livraison partielle reste suivie ; on peut relancer le fournisseur ou replanifier le reste à livrer.
- **Factures et dettes fournisseurs** :
  - statuts : à payer, en cours, en retard, payée ;
  - le paiement (espèces, banque, mobile money) crée une dépense rattachée au stock, avec un reçu PDF ;
  - règle farine : livrée à crédit, payée le lundi ou mardi suivant (19 525 FCFA le sac).

### 5.8 Dépenses et budget

- **Budget mensuel par catégorie** :
  - catégories : matières premières, salaires, électricité, eau, administration, technique, petit matériel, lait supplément salaire, extra ;
  - statut : OK / à surveiller / dépassé.
- **Saisie d'une dépense** :
  - catégorie, libellé, montant, payé par (caisse, banque, mobile money), photo du justificatif ;
  - saisie par la caissière, le gérant ou le propriétaire ; l'auteur et son profil sont enregistrés.
- **Rattachement obligatoire** :
  - à la **production en cours** (achat pendant la session) ;
  - à la **semaine** (frais généraux) ;
  - ou au **stock** : matière, quantité, fournisseur ou achat au marché ; l'entrée de stock est alors créée.
- Chaque dépense est numérotée (**DEP-xxxx**) et porte sa semaine.
- **Seuil de validation** (50 000 FCFA par défaut) : au-delà, une demande est envoyée au gérant si la dépense vient d'une caissière, au propriétaire si elle vient du gérant.
- Filtres par semaine et par rattachement ; la demande liée s'affiche sur chaque dépense.

### 5.9 Demandes de validation

| Type | Émise par | Validée par | Rattachée à |
|---|---|---|---|
| Livraison au-delà du plafond | Caissière | Gérant de la semaine ou propriétaire | Client |
| Dépense au-dessus du seuil | Caissière / gérant | Gérant / propriétaire | Dépense DEP-xxxx |
| État de paie | Gérant | Propriétaire | Paie du mois |
| Inventaire avec écart > 5 % | Gérant / chef de production | Propriétaire | Inventaire AUD-xx |
| Augmentation de production après validation du plan | Chef de production | Gérant de la semaine ou propriétaire | Plan de la session |

- Numéro **DEM-xxx**, émetteur, profil, heure, destinataire, lien vers l'objet.
- Accord ou refus tracé (par qui, à quelle heure). La dépense ou l'inventaire liés changent de statut automatiquement.
- La caissière voit ses propres demandes.

### 5.10 Personnel et paie

- **Calcul** : Net = base − absences − avances − pénalités + gains + impayé antérieur. Une absence vaut base ÷ 26 par jour.
- **Gains et pénalités multiples** par personne et par mois, chacun avec description, montant, date et auteur. Ils sont modifiables tant que l'état de paie est en brouillon.
- **Jour de paie** planifié pour chaque mois, avec un calendrier des paies passées et à venir.
- **Impayés** : le reste non payé d'un mois est repris automatiquement sur le mois suivant.
- **Parcours** :
  1. Brouillon : le gérant prépare.
  2. Soumis : envoyé au propriétaire.
  3. Validé : le propriétaire accepte.
  4. Paiement : le gérant paie, individuellement ou tous les restes ; le paiement peut être partiel.
  5. Payée.
- Chaque paiement crée une dépense « Salaires » rattachée à la semaine. Les bulletins sont exportables en PDF.

### 5.11 Tableau de bord

- Indicateurs : recette du mois et taux d'encaissement, dettes clients, dettes fournisseurs, semaine en cours (gérant et responsable de production).
- Graphique de la recette par nuit et production par produit.
- **Alertes cliquables** :
  - factures en retard ;
  - stock bas ;
  - clients au-delà du plafond ;
  - budget dépassé ;
  - production non clôturée ;
  - manquants fournisseurs ;
  - manques de caisse ;
  - demandes en attente ;
  - écarts matière.

### 5.12 Notifications

Centre de notifications dans l'en-tête, avec compteur de non-lues. Chaque notification renvoie vers l'écran concerné et n'est envoyée qu'aux rôles concernés.

| Notification | Destinataires |
|---|---|
| Programmation de la semaine publiée | Toute l'équipe |
| Plan proposé, validé, production ouverte et clôturée | Selon l'étape : gérant, chef, caisse, propriétaire |
| Clients habituels sans commande (incitation à commander) | Caisse, gérant, propriétaire |
| Demande estimée au-dessus du plan | Chef, gérant, propriétaire |
| Reste à produire | Chef, gérant, caisse, propriétaire |
| Demande d'augmentation de production et décision | Gérant, propriétaire, puis chef et caisse |
| Contrôle de stock à faire | Gérant, chef, propriétaire |

Envoi complémentaire par WhatsApp ou SMS (fournisseur à choisir).

### 5.13 Administration

- **Utilisateurs** : création en 3 étapes avec aperçu des accès.
  1. Identité : nom, adresse Gmail, téléphone +237.
  2. Groupe d'utilisateurs.
  3. Canal de vérification et envoi de l'invitation.
- Contrôles : e-mail valide et unique, numéro à 9 chiffres commençant par 6, groupe obligatoire.
- Réinitialisation du code, désactivation, changement de groupe.
- **Sauvegardes** :
  - copie locale toutes les 4 h et à chaque clôture ;
  - copie cloud, avec une alerte au-delà de 48 h sans copie ;
  - restauration guidée.
- **Journal des actions** : toutes les opérations avec l'auteur, le profil et l'heure.
- **Paramètres** : plafond de dette, seuil de validation des dépenses, écart matière toléré, fiches produits.

---

## 6. Règles de gestion récapitulatives

| N° | Règle |
|---|---|
| R1 | Toute opération est rattachée à une semaine et à un auteur identifié. |
| R2 | Une seule semaine ouverte à la fois ; la suivante s'ouvre après la clôture de la précédente. |
| R3 | Une semaine ne se clôture pas tant qu'une caisse est ouverte ou qu'une production est en cours. |
| R4 | Le plan de production est proposé par le responsable de la semaine et validé par le gérant avant l'ouverture. |
| R5 | La clôture de production exige le réalisé et la consommation réelle, et génère les sorties de stock. |
| R6 | Dette client plafonnée à 2 000 FCFA (paramétrable) ; au-delà, accord du gérant obligatoire ; règlement au plus tard le dimanche. |
| R7 | Référence de transaction obligatoire pour tout paiement mobile money. |
| R8 | Dépense ≥ 50 000 FCFA : validation obligatoire (gérant pour la caisse, propriétaire pour le gérant). |
| R9 | Inventaire avec écart > 5 % : validation du propriétaire avant ajustement. |
| R10 | Écart matière > 2 kg par sac : justification obligatoire du chef de production. |
| R11 | Toute réception compte la quantité réellement livrée ; le manquant reste suivi jusqu'à la livraison du reste. |
| R12 | Le reste non payé d'une paie devient un impayé repris sur la paie suivante. |
| R13 | Une caisse fermée n'est rouverte que par le gérant ou le propriétaire, avec traçabilité. |
| R14 | Double authentification par SMS ou WhatsApp à chaque connexion (désactivable par l'administrateur). |
| R15 | Toute augmentation de production après validation du plan passe par l'accord du gérant. |
| R16 | Deux contrôles physiques du stock par semaine (mercredi et dimanche) ; un contrôle manqué remonte en alerte. |

---

## 7. Exigences non fonctionnelles

- **Fonctionnement hors ligne** : toutes les saisies continuent sans internet ; la synchronisation et la sauvegarde cloud reprennent au retour de la connexion.
- **Rapidité au comptoir** :
  - navigation au clavier (Tab / Entrée) ;
  - grands champs numériques ;
  - recherche client par les premières lettres.
- **Ergonomie** :
  - zones tactiles d'au moins 44 px ;
  - contrastes lisibles ;
  - thème clair et sombre ;
  - interface en français et en anglais.
- **Supports** : PC du comptoir et téléphone (vue propriétaire et gérant).
- **Traçabilité** : journal non modifiable.
- **Formats** :
  - montants en FCFA avec séparateur des milliers ;
  - dates au format français ;
  - exports PDF (bons, relevés, reçus, bulletins, passation).

---

## 8. Identité visuelle

- Couleurs :
  - or `#F2B705` pour les actions principales ;
  - chocolat `#5A3220` pour la navigation ;
  - crème `#FFF4DC` pour le fond.
- États : vert (OK), ambre (à surveiller), rouge (bloquant / dépassé).
- Typographie : Manrope.

---

## 9. Données de démonstration (prototype)

Ces données sont fictives et sont à remplacer par les vraies :

- Comptes :
  - davy, rachel (caissiers) ;
  - willy, patrick, christelle (gérants) ;
  - serge, ignace (production) ;
  - fotso (propriétaire) ;
  - admin.
- Mot de passe `optiboul`, code de vérification `123456`.
- Semaines 41 (clôturée), 42 (ouverte, gérant Willy, production Serge), 43 et 44 (planifiées).
- Fournisseurs fictifs :
  - Grands Moulins du Centre (farine) ;
  - Mfoundi Levures & Sel ;
  - Glacière d'Olembé ;
  - Bois Nkolondom ;
  - Huilerie Mvog-Mbi.
- Clients, montants, prix unitaires et numéros de téléphone fictifs.

---

## 10. Points à confirmer

1. Noms et conditions réels des fournisseurs, prix unitaires des matières.
2. Numéros de téléphone et adresses Gmail réels des utilisateurs.
3. Heures limites des commandes et des étapes de production.
4. Seuils définitifs : plafond client, seuil de dépense, tolérance d'inventaire (5 %), écart matière (2 kg/sac).
5. Règle de rotation des gérants et des responsables de production sur l'année.
6. Fournisseur SMS / WhatsApp pour l'envoi des codes et des relances.
7. Moyenne réelle des ventes au guichet par session (la démo utilise 120 BAG, 60 KO, 20 GC).
8. Jours et heures définitifs des deux contrôles de stock hebdomadaires.
9. Recettes, temps et températures des fiches techniques, à valider par le chef.
