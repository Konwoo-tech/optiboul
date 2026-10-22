# Graph Report - optiboul  (2026-10-22)

## Corpus Check
- 348 files · ~72,912 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 37 file(s) not represented in the graph (top: (none) 22, .css 9, .example 4)

## Summary
- 1836 nodes · 3752 edges · 193 communities (73 shown, 120 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 283 edges (avg confidence: 0.89)
- Token cost: 306,506 input · 205,993 output

## Community Hubs (Navigation)
- Tests de bout en bout Playwright
- Architecture technique et ADR
- Parcours UX et optimisations O1-O18
- Tests de l'application web
- Écran clients et dettes
- Applications Django par domaine
- Thème OptiBoul et couleurs
- Modèle utilisateur et profil
- Routage API et documentation OpenAPI
- Client API généré et transport HTTP
- Administration Django des comptes
- Sauvegarde et restauration PostgreSQL
- Règles de caisse (écart, remise au coffre)
- Composants d'interface partagés
- Internationalisation FR/EN
- Espaces de l'application web
- Écrans de connexion
- Import du backlog en issues
- EP08 Production
- Tests du modèle utilisateur
- Gestionnaire d'utilisateurs
- Navigation par profil
- Configuration TypeScript
- EP03 Semaines et planning
- Sérialiseurs et vues API
- Routage Traefik et accès distant
- Simulation : couche API
- Simulation : comptes et routeur
- Lots, sprints et définition de terminé
- Tableau GitHub Projects
- Fixtures et tâches Celery
- Manifeste du paquet web
- EP04 Caisses
- EP05 Commandes et livraisons
- Déconnexion pour inactivité
- Simulation : données de démonstration
- EP06 Clients et dettes
- Clean Architecture et ressources API
- En-têtes et contexte d'écran
- Pavé numérique et fournisseur de thème
- Simulation : clients et livraisons
- Intégration continue et contrat API
- Adaptateurs allauth
- Mise en page et navigation
- Démarrage Django (WSGI, Celery)
- AWS, Mailgun et hors ligne
- Dépendances de développement web
- Scripts pnpm
- EP02 Administration
- Vue API utilisateur
- EP14 Hors ligne et file d'envoi
- EP01 Authentification et sécurité
- EP13 Tableau de bord et rapports
- .github/ISSUE_TEMPLATE
- ADR-13 à ADR-20
- EP07 Demandes et notifications
- EP09 Stocks et inventaires
- Cinq applications web (spécification v3)
- Synchronisation des issues
- api/optiboul/users/tests
- web
- specifications
- specifications
- specifications
- .github
- api
- api
- api
- web/e2e/visuel
- .pre-commit-config.yaml
- .github/workflows
- adr
- adr
- web
- README.md
- infra
- adr
- specifications
- specifications
- github
- web
- api/compose/production/postgres/maintena
- api/compose/production/postgres/maintena
- api/.devcontainer
- web
- api

## God Nodes (most connected - your core abstractions)
1. `OptiBoul ERP — Spécification technique et architecture (v3)` - 117 edges
2. `OptiBoul ERP — Cahier des charges v5` - 67 edges
3. `User` - 61 edges
4. `OptiBoul ERP — Profils, parcours utilisateurs et UX (v3)` - 55 edges
5. `OptiBoul ERP — Backlog produit v2` - 27 edges
6. `vitest` - 26 edges
7. `react` - 25 edges
8. `useUtilisateurCourant()` - 22 edges
9. `compilerOptions` - 20 edges
10. `cliquer()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Mailpit (serveur SMTP local de test)` --semantically_similar_to--> `Mailgun (django-anymail)`  [INFERRED] [semantically similar]
  apps/api/README.md → docs/adr/ADR-14-aws-mailgun.md
- `DoD: server-side rights per profile, action traced in journal` --conceptually_related_to--> `X-OptiBoul-Entree header`  [AMBIGUOUS]
  .github/pull_request_template.md → apps/api/compose/production/traefik/traefik.yml
- `Navigation : entrées du menu par profil et par lot` --conceptually_related_to--> `ADR-10 Cinq applications React par usage`  [AMBIGUOUS]
  docs/specifications/OptiBoul_ERP_Parcours_utilisateurs_UX_v3.md → docs/specifications/OptiBoul_ERP_Specification_technique_Architecture_v3.md
- `OptiBoul ERP` --conceptually_related_to--> `R20 · Local d'abord : aucune action du comptoir ne dépend d'internet`  [INFERRED]
  README.md → docs/adr/ADR-14-aws-mailgun.md
- `Origine unique en production (Traefik route /api, /accounts, /static vers Django)` --conceptually_related_to--> `Traefik (mkcert, routage par préfixe, entrée distante)`  [INFERRED]
  README.md → docs/adr/ADR-15-versions-socle.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Cycle de production d'une session (commandes → plan → validation → réalisé → clôture → sorties de stock)** — docs_specifications_optiboul_erp_cahier_des_charges_v5_heure_limite_commandes, docs_specifications_optiboul_erp_cahier_des_charges_v5_plan_production, docs_specifications_optiboul_erp_cahier_des_charges_v5_demande_estimee, docs_specifications_optiboul_erp_cahier_des_charges_v5_augmentation_production, docs_specifications_optiboul_erp_cahier_des_charges_v5_o6, docs_specifications_optiboul_erp_cahier_des_charges_v5_r4, docs_specifications_optiboul_erp_cahier_des_charges_v5_r5, docs_specifications_optiboul_erp_cahier_des_charges_v5_consommation_reelle, docs_specifications_optiboul_erp_cahier_des_charges_v5_reste_a_produire [EXTRACTED 1.00]
- **Comptoir sans dépendance à internet (file d'envoi, TOTP, hors ligne)** — docs_specifications_optiboul_erp_cahier_des_charges_v5_o15, docs_specifications_optiboul_erp_cahier_des_charges_v5_r22, docs_specifications_optiboul_erp_cahier_des_charges_v5_file_envoi, docs_specifications_optiboul_erp_cahier_des_charges_v5_totp_codes_secours, docs_specifications_optiboul_erp_backlog_produit_v2_us_141, docs_specifications_optiboul_erp_backlog_produit_v2_us_140, docs_specifications_optiboul_erp_cahier_des_charges_v5_bon_de_livraison [INFERRED 0.85]
- **Circuit de demande de validation avec escalade au propriétaire** — docs_specifications_optiboul_erp_cahier_des_charges_v5_module_demandes_validation, docs_specifications_optiboul_erp_cahier_des_charges_v5_demande_dem, docs_specifications_optiboul_erp_cahier_des_charges_v5_o5, docs_specifications_optiboul_erp_cahier_des_charges_v5_r19, docs_specifications_optiboul_erp_backlog_produit_v2_us_070, docs_specifications_optiboul_erp_backlog_produit_v2_us_071, docs_specifications_optiboul_erp_backlog_produit_v2_us_072 [EXTRACTED 1.00]
- **Cinq applications React partageant les paquets du monorepo et appelant la même API** — docs_specifications_optiboul_erp_specification_technique_architecture_v3_app_portail, docs_specifications_optiboul_erp_specification_technique_architecture_v3_app_comptoir, docs_specifications_optiboul_erp_specification_technique_architecture_v3_app_atelier, docs_specifications_optiboul_erp_specification_technique_architecture_v3_app_gestion, docs_specifications_optiboul_erp_specification_technique_architecture_v3_app_pilotage, docs_specifications_optiboul_erp_specification_technique_architecture_v3_package_ui, docs_specifications_optiboul_erp_specification_technique_architecture_v3_package_auth, docs_specifications_optiboul_erp_specification_technique_architecture_v3_package_api_client, docs_specifications_optiboul_erp_specification_technique_architecture_v3_api_django_drf [EXTRACTED 1.00]
- **Flux d'envoi hors ligne via outbox transactionnelle** — docs_specifications_optiboul_erp_specification_technique_architecture_v3_adr_05_outbox_transactionnelle, docs_specifications_optiboul_erp_specification_technique_architecture_v3_table_outbox_message, docs_specifications_optiboul_erp_specification_technique_architecture_v3_tache_dispatcher_outbox, docs_specifications_optiboul_erp_specification_technique_architecture_v3_passerelle_sms_whatsapp, docs_specifications_optiboul_erp_specification_technique_architecture_v3_django_app_notifications, docs_specifications_optiboul_erp_parcours_utilisateurs_ux_v3_optimisation_o15 [EXTRACTED 1.00]
- **Dépassement de plafond : vérification, demande, validation à distance et escalade** — docs_specifications_optiboul_erp_parcours_utilisateurs_ux_v3_parcours_p4, docs_specifications_optiboul_erp_specification_technique_architecture_v3_verifier_plafond, docs_specifications_optiboul_erp_specification_technique_architecture_v3_api_demandes, docs_specifications_optiboul_erp_specification_technique_architecture_v3_table_demande, docs_specifications_optiboul_erp_specification_technique_architecture_v3_tache_escalader_demandes, docs_specifications_optiboul_erp_specification_technique_architecture_v3_regle_r19, docs_specifications_optiboul_erp_parcours_utilisateurs_ux_v3_optimisation_o5, docs_specifications_optiboul_erp_specification_technique_architecture_v3_code_gerant_sur_poste [INFERRED 0.85]
- **Recentrage sur deux applications autonomes (apps/api, apps/web unique)** — docs_adr_adr_17_structure_apps_adr_17, docs_adr_adr_18_application_web_unique_adr_18, docs_adr_adr_19_sans_application_mobile_adr_19, docs_adr_adr_20_web_autonome_adr_20, docs_readme_adr_primacy [EXTRACTED 1.00]
- **Affichage selon le profil, droits vérifiés par l'API** — docs_adr_adr_18_application_web_unique_profil_groupe, docs_adr_adr_18_application_web_unique_users_me_endpoint, docs_adr_adr_18_application_web_unique_profils_ts, docs_adr_adr_18_application_web_unique_espaces, docs_adr_adr_18_application_web_unique_server_side_rights [EXTRACTED 1.00]
- **Accès distant sécurisé (tunnel, Traefik, entrée distante, double authentification)** — docs_adr_adr_19_sans_application_mobile_remote_access_tunnel, infra_readme_cloudflare_tunnel_service, docs_adr_adr_15_versions_socle_traefik, docs_adr_adr_19_sans_application_mobile_entree_distante_header, docs_adr_adr_19_sans_application_mobile_mfa_distante [INFERRED 0.85]
- **Remote access via tunnel (ADR-19)** — docker_compose_production_service_tunnel, apps_api_compose_production_traefik_traefik_entrypoint_remote, apps_api_compose_production_traefik_traefik_router_django_distant, apps_api_compose_production_traefik_traefik_router_web_distant, apps_api_compose_production_traefik_traefik_middleware_entree_distante, apps_api_compose_production_traefik_traefik_x_optiboul_entree, docs_adr_adr_19_sans_application_mobile_adr_19 [INFERRED 0.85]
- **API contract enforcement (schema.yml + generated client)** — _github_workflows_ci_schema_yml, _github_workflows_ci_step_contrat_api_schema, _github_workflows_ci_step_contrat_api_client, _github_pull_request_template_dod_migration_api_client, _github_workflows_ci_job_changements [INFERRED 0.85]
- **Production routing Traefik → django / web / flower** — apps_api_docker_compose_production_service_traefik, apps_api_compose_production_traefik_traefik_service_django, apps_api_compose_production_traefik_traefik_service_web, apps_api_compose_production_traefik_traefik_service_flower, apps_api_docker_compose_production_service_django, docker_compose_production_service_web, apps_api_docker_compose_production_service_flower [INFERRED 0.85]

## Communities (193 total, 120 thin omitted)

### Community 0 - "Tests de bout en bout Playwright"
Cohesion: 0.05
Nodes (66): arguments_, fichiers, inconnus, largeurNom, Ligne, lignes, options, retenus (+58 more)

### Community 1 - "Architecture technique et ADR"
Cohesion: 0.06
Nodes (51): ADR-01 à ADR-12 (spécification technique §12), Documentation OptiBoul ERP, États du système (hors ligne, notifications, reste à produire, verrouillé…), OptiBoul ERP — Spécification technique et architecture (v3), Accès distant Cloudflare Tunnel ou Tailscale, Ressource API /caisses/ (ouvrir, remise-coffre, fermer, rouvrir), Ressource API /productions/ (plan 3 sources, valider, supplement, fournee, reste-a-produire), Ressource API /stocks/ et /controles-stock/ (+43 more)

### Community 2 - "Parcours UX et optimisations O1-O18"
Cohesion: 0.09
Nodes (29): OptiBoul ERP — Profils, parcours utilisateurs et UX (v3), Navigation : entrées du menu par profil et par lot, Objectifs d'expérience (< 5 s, < 30 s, 0 retard de pétrissage, 0 FCFA d'écart), P0 Se connecter et changer d'utilisateur, P1 Planifier une semaine, P10 Clôturer la semaine et passer la main, P11 Suivre et décider à distance, P12 Administrer (utilisateurs, sauvegardes) (+21 more)

### Community 3 - "Tests de l'application web"
Cohesion: 0.08
Nodes (27): configurerApi(), ouvrir(), serveur, Adresse(), ECRAN, ouvrir(), identifierSansDeuxFacteurs(), identifier (+19 more)

### Community 4 - "Écran clients et dettes"
Cohesion: 0.11
Nodes (36): DetailClient(), Props, quand(), Chiffres(), CLE_FILTRE, EcranClients(), LigneClient(), LigneProps (+28 more)

### Community 5 - "Applications Django par domaine"
Cohesion: 0.06
Nodes (13): AchatsConfig, CaisseConfig, ClientsConfig, CoreConfig, DemandesConfig, DepensesConfig, NotificationsConfig, PaieConfig (+5 more)

### Community 6 - "Thème OptiBoul et couleurs"
Cohesion: 0.10
Nodes (24): COULEUR, Jauge(), Props, chocolat, NIVEAUX, or, resolveurVariablesOptiboul(), variablesDe() (+16 more)

### Community 7 - "Modèle utilisateur et profil"
Cohesion: 0.10
Nodes (10): UserAdminChangeForm, Meta, User, test_user_get_absolute_url(), TestUserDetailView, TestUserRedirectView, TestUserUpdateView, UserDetailView (+2 more)

### Community 9 - "Client API généré et transport HTTP"
Cohesion: 0.12
Nodes (17): creerClientRequetes(), echec(), configuration, ConfigurationApi, COOKIES_CSRF, envoyer(), ErreurApi, estSansSession() (+9 more)

### Community 10 - "Administration Django des comptes"
Cohesion: 0.08
Nodes (10): GroupeAdmin, ProfilGroupeInline, UserAdmin, UserAdminCreationForm, Meta, UserSignupForm, UserSocialSignupForm, ProfilGroupe (+2 more)

### Community 11 - "Sauvegarde et restauration PostgreSQL"
Cohesion: 0.10
Nodes (6): constants.sh script, message_error(), message_info(), message_success(), message_welcome(), messages.sh script

### Community 12 - "Règles de caisse (écart, remise au coffre)"
Cohesion: 0.11
Nodes (14): attendu_en_caisse(), ecart_caisse(), remise_coffre_proposee(), ResultatFermeture, StatutEcart, test_caisse_en_manque(), test_caisse_juste(), test_ecart_est_compte_moins_attendu() (+6 more)

### Community 13 - "Composants d'interface partagés"
Cohesion: 0.13
Nodes (17): EcranPrevu(), Ecran, BadgeEtat(), NiveauEtat, Carte(), Props, EcranErreur(), Props (+9 more)

### Community 14 - "Internationalisation FR/EN"
Cohesion: 0.11
Nodes (17): changerLangue(), Langue, langueMemorisee(), ressources, cheminEcran(), marquerNotificationsLues(), useNotificationsSimulees(), BasculeApparence() (+9 more)

### Community 15 - "Espaces de l'application web"
Cohesion: 0.18
Nodes (20): App(), Atelier, Comptoir, Connexion, Gestion, useUtilisateurCourant(), Atelier(), Comptoir() (+12 more)

### Community 16 - "Écrans de connexion"
Cohesion: 0.18
Nodes (19): ChoixCompteGoogle(), Props, ChoixUtilisateur(), Props, EcransSimules(), Props, FormulaireEmail(), Props (+11 more)

### Community 17 - "Import du backlog en issues"
Cohesion: 0.15
Nodes (10): cellules(), corps_recit(), dater_sprints(), lien_backlog(), lire_backlog(), main(), Recit, Sprint (+2 more)

### Community 18 - "EP08 Production"
Cohesion: 0.15
Nodes (24): EP08 · Production, US-080 · Produits et fiches techniques, US-081 · Plan calculé depuis les commandes, US-082 · Validation du plan avec auto-validation à T-15 min, US-083 · Ouvrir, saisir le réalisé et clôturer la production, US-084 · Consommation réelle et justification des écarts, US-085 · Production non clôturée archivée et signalée, US-086 · Plan = commandes + demande estimée + supplément (+16 more)

### Community 19 - "Tests du modèle utilisateur"
Cohesion: 0.11
Nodes (8): test_sante_accessible_sans_connexion(), Profil, test_createsuperuser_command(), TestUserManager, test_l_api_renvoie_le_profil_de_l_utilisateur_connecte(), test_le_profil_vient_du_groupe(), test_les_groupes_de_depart_portent_un_profil(), test_un_super_utilisateur_est_administrateur()

### Community 20 - "Gestionnaire d'utilisateurs"
Cohesion: 0.13
Nodes (3): UserManager, test_user_detail(), test_detail()

### Community 21 - "Navigation par profil"
Cohesion: 0.16
Nodes (15): ARRIVEE, CleEcran, DIRECTION, ECRANS, PROFILS_CONNUS, Configuration, Espace, espacesDe() (+7 more)

### Community 22 - "Configuration TypeScript"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+13 more)

### Community 23 - "EP03 Semaines et planning"
Cohesion: 0.14
Nodes (20): Celery / Celery Beat, Cookiecutter Django (DRF, Celery, Docker), EP03 · Semaines et planning, PostgreSQL, React (Vite, TypeScript), Redis, US-001 · Monorepo Cookiecutter Django + React, US-030 · Planifier une semaine et copier la précédente (+12 more)

### Community 24 - "Sérialiseurs et vues API"
Cohesion: 0.12
Nodes (3): sante(), UserSerializer, Meta

### Community 25 - "Routage Traefik et accès distant"
Cohesion: 0.16
Nodes (20): 4-digit code login (refused remotely), entryPoint flower (:5555), entryPoint remote (:8443, tunnel only), entryPoint web (:80 → redirect web-secure), entryPoint web-secure (:443), middleware csrf (X-CSRFToken proxy header), middleware entree-distante, middleware entree-locale (+12 more)

### Community 26 - "Simulation : couche API"
Cohesion: 0.17
Nodes (17): annulerIdentification(), envoyerCodeOtp(), JSON_ENTETES, NotificationVue, poster(), Reponse, ReponseIdentification, verifierCodeOtp() (+9 more)

### Community 27 - "Simulation : comptes et routeur"
Cohesion: 0.17
Nodes (20): COMPTES_SIMULES, CompteSimule, attendre(), CONTEXTE, Corps, EnAttente, envoyerCode(), ESSAIS_MAX (+12 more)

### Community 28 - "Lots, sprints et définition de terminé"
Cohesion: 0.13
Nodes (17): OptiBoul ERP — Backlog produit v2, EP00 · Socle technique, EP15 · Reprise et mise en service, GitHub Actions (CI), Jalons d'acceptation, Lot 0 · Socle technique, Lot 1 · Ventes, dettes, production de base, fournisseurs, dépenses, Lot 2 · Stocks et inventaires, consommation réelle, paie, marge (+9 more)

### Community 30 - "Fixtures et tâches Celery"
Cohesion: 0.14
Nodes (6): _media_storage(), user(), get_users_count(), UserFactory, Meta, test_user_count()

### Community 31 - "Manifeste du paquet web"
Cohesion: 0.11
Nodes (18): description, engines, node, name, packageManager, private, sideEffects, type (+10 more)

### Community 32 - "EP04 Caisses"
Cohesion: 0.20
Nodes (17): EP04 · Caisses, US-040 · Ouvrir la caisse en comptant le fonds, US-041 · Remise d'espèces au coffre, US-042 · Fermer la caisse avec un seul comptage, US-043 · Rouvrir une caisse fermée avec motif, US-044 · Historique et récapitulatif par caissière, OptiBoul ERP — Cahier des charges v5, Données de démonstration (comptes, semaines 41–44, fournisseurs) (+9 more)

### Community 33 - "EP05 Commandes et livraisons"
Cohesion: 0.18
Nodes (17): EP05 · Commandes et livraisons, US-050 · Saisir les commandes et reprendre celles de la veille, US-051 · Recherche client et « Livrer comme commandé », US-052 · Encaisser espèces / MoMo / Orange Money, US-053 · Blocage au-delà du plafond de dette, US-055 · Mouvements internes avec motif, US-057 · Clients habituels sans commande et relance automatique, US-058 · Alerte de commande tardive au chef (+9 more)

### Community 34 - "Déconnexion pour inactivité"
Cohesion: 0.20
Nodes (11): EVENEMENTS, Options, monter(), surExpiration, useDeconnexionAutomatique(), effacerMessageConnexion(), lireMessageConnexion(), memoriserMessageConnexion() (+3 more)

### Community 35 - "Simulation : données de démonstration"
Cohesion: 0.20
Nodes (14): CODE_DEMO, CODE_OTP_DEMO, MOT_DE_PASSE_DEMO, appeler(), identifier(), masquerTelephone(), appeler(), envoyer() (+6 more)

### Community 36 - "EP06 Clients et dettes"
Cohesion: 0.17
Nodes (17): EP06 · Clients et dettes, Risque : passerelle SMS / WhatsApp non choisie, Risques du backlog, US-023 · Modifier les paramètres métier, US-060 · Fiches clients et tarifs, US-061 · Liste des dettes avec jauge et statut, US-062 · Relance WhatsApp d'un ou plusieurs clients, US-063 · Relances automatiques jeudi et samedi (+9 more)

### Community 37 - "Clean Architecture et ressources API"
Cohesion: 0.16
Nodes (15): Ressource API /demandes/ (accorder, refuser, en-attente), Ressource API /livraisons/ (livrer-comme-commande, bon, envoyer-whatsapp), Ressource API /paie/ (preparer, soumettre, valider, payer, bulletins), Ressource API /semaines/ (planifier, copier-precedente, ouvrir, cloturer, passation), Cas d'usage EnregistrerLivraison, FermerCaisse, DemanderAutorisation, Backend Cookiecutter Django (backend/), Application Django achats (fournisseurs, réceptions, factures), Application Django core (semaines, planning, paramètres, journal) (+7 more)

### Community 38 - "En-têtes et contexte d'écran"
Cohesion: 0.26
Nodes (12): ColonneSession(), EnTeteEcran(), cleTitre(), useContexteSimule(), EnTetePage(), Pastille(), useCreneau(), useHorloge() (+4 more)

### Community 39 - "Pavé numérique et fournisseur de thème"
Cohesion: 0.15
Nodes (10): LONGUEUR_PIN, Props, TOUCHES, Props, themeOptiboul, AfficherToast, ContexteToast, Toasts() (+2 more)

### Community 40 - "Simulation : clients et livraisons"
Cohesion: 0.15
Nodes (15): A, B, CLIENTS, clientsSimules(), historiqueDe(), LIVRAISONS_DU_JOUR, PEUT_RELANCER, PEUT_VOIR (+7 more)

### Community 41 - "Intégration continue et contrat API"
Cohesion: 0.19
Nodes (14): DoD: reversible migration, make api-client run, DoD: unit/API tests green, Playwright journeys updated, CI workflow, api job (Docker compose, pytest), changements job (dorny/paths-filter), web job (pnpm: format, lint, typecheck, Vitest, build), apps/api/schema.yml OpenAPI contract, Spécification technique (§2, §7, §10.2, §11) (+6 more)

### Community 43 - "Mise en page et navigation"
Cohesion: 0.27
Nodes (12): MiseEnPage(), BarreLaterale(), BarreTelephone(), Liens(), Logo(), cleMenu(), SIMULATION, deconnecterSimulation() (+4 more)

### Community 45 - "AWS, Mailgun et hors ligne"
Cohesion: 0.16
Nodes (12): Celery worker et beat (config.celery_app), Mailpit (serveur SMTP local de test), OptiBoul API (Built with Cookiecutter Django), AWS S3 (médias, sauvegardes, django-storages), Mailgun (django-anymail), WhiteNoise (statiques servis localement), Gabarit Cookiecutter Django, Django 6.0, Python 3.14, uv, PostgreSQL 16, Celery 5.6, DRF 3.18 (+4 more)

### Community 46 - "Dépendances de développement web"
Cohesion: 0.13
Nodes (15): devDependencies, jsdom, msw, orval, oxlint, @playwright/test, prettier, @testing-library/react (+7 more)

### Community 47 - "Scripts pnpm"
Cohesion: 0.13
Nodes (15): scripts, api-client, build, dev, dev:simulation, e2e, e2e:navigateurs, e2e:visuel (+7 more)

### Community 48 - "EP02 Administration"
Cohesion: 0.21
Nodes (15): EP02 · Administration, US-020 · Créer un utilisateur en 3 étapes, US-021 · Créer des groupes et changer un utilisateur de groupe, US-024 · Journal des actions filtrable, Groupes d'utilisateurs (portent le profil de droits), Journal non modifiable (valeurs avant / après), Ma semaine (liste de tâches du gérant), Matrice des droits (§3.3) (+7 more)

### Community 50 - "EP14 Hors ligne et file d'envoi"
Cohesion: 0.23
Nodes (13): Expo Notifications (APNs / FCM), Notifications SMS / WhatsApp (O5), EP14 · Hors ligne, sauvegardes et file d'envoi, US-054 · Bon de livraison écran / PDF / WhatsApp, US-140 · État en ligne / hors ligne et envois en attente, US-141 · File d'envoi (outbox) rejouée au retour du réseau, US-142 · Sauvegarde locale 4 h et copie cloud chiffrée, US-143 · Restauration guidée testée (+5 more)

### Community 51 - "EP01 Authentification et sécurité"
Cohesion: 0.25
Nodes (13): EP01 · Authentification et sécurité, US-010 · Connexion nom + code à 4 chiffres sur poste de confiance, US-011 · Double authentification SMS/WhatsApp pour le gérant, US-012 · Connexion sans réseau par TOTP ou code de secours, US-013 · Connexion Google du propriétaire à distance, US-014 · Changer d'utilisateur sans perdre la saisie, US-015 · Réinitialiser le mot de passe, US-022 · Enregistrer / révoquer un poste de confiance (+5 more)

### Community 52 - "EP13 Tableau de bord et rapports"
Cohesion: 0.22
Nodes (12): EP13 · Tableau de bord et rapports, Playwright (tests de parcours), US-056 · Navigation entièrement au clavier, US-130 · Accueil selon le profil, US-131 · Indicateurs et graphiques du mois, US-132 · Alertes cliquables, US-133 · Export des rapports PDF et Excel, US-134 · Marge estimée (+4 more)

### Community 53 - ".github/ISSUE_TEMPLATE"
Cohesion: 0.20
Nodes (12): Anomalie issue template, Cahier des charges (CdC), Constat field (application, profil, étapes, résultat), Règle ou parcours concerné (R…, P…), Issue template config (blank issues enabled), Critères d'acceptation, User story format (En tant que… je veux… afin de…), Priorité MoSCoW (Must, Should, Could) (+4 more)

### Community 56 - "ADR-13 à ADR-20"
Cohesion: 0.36
Nodes (3): apps/web (application web React unique), PWA (Web Push) possible plus tard, Index des décisions d'architecture (ADR)

### Community 57 - "EP07 Demandes et notifications"
Cohesion: 0.26
Nodes (11): EP07 · Demandes et notifications, US-070 · Émettre une demande liée à l'objet bloqué, US-071 · Accorder / refuser une demande à distance, US-072 · Escalade des demandes non traitées au propriétaire, US-073 · Notifications regroupées, US-074 · Centre de notifications avec compteur et routage par rôle, Centre de notifications avec compteur, Demande de validation DEM-xxx (+3 more)

### Community 58 - "EP09 Stocks et inventaires"
Cohesion: 0.33
Nodes (11): EP09 · Stocks et inventaires, US-090 · État du stock par matière, US-092 · Pertes, casse et corrections motivées, US-093 · Deux contrôles de stock guidés par semaine, US-094 · Stock à date, Contrôles de stock mercredi et dimanche, Inventaire et ajustement (tolérance 5 %), Module Stocks (§5.6) (+3 more)

### Community 59 - "Cinq applications web (spécification v3)"
Cohesion: 0.26
Nodes (7): API Django 5.2 LTS + DRF + Gunicorn, Application web atelier (/atelier), Application web comptoir (/comptoir), Application web gestion (/gestion), Application web pilotage (/pilotage), Application web portail (/), Proxy Traefik (entrées locale et distante)

### Community 60 - "Synchronisation des issues"
Cohesion: 0.38
Nodes (6): corps_epopee(), Epopee, etiquette_epopee(), etiquettes_epopee(), etiquettes_recit(), Synchronisation

### Community 62 - "web"
Cohesion: 0.20
Nodes (10): dependencies, @fontsource-variable/manrope, i18next, @mantine/core, @mantine/hooks, react, react-dom, react-i18next (+2 more)

### Community 63 - "specifications"
Cohesion: 0.33
Nodes (9): EP10 · Fournisseurs et réceptions, US-100 · Fournisseurs et planification des réceptions, US-101 · Réception en un clic depuis la réception planifiée, US-102 · Manquant relançable ou replanifiable, US-103 · Payer une facture et obtenir un reçu, Factures fournisseurs (farine à crédit, 19 525 FCFA le sac), Module Fournisseurs et réceptions (§5.7), R11 · Réception compte la quantité livrée ; manquant suivi (+1 more)

### Community 64 - "specifications"
Cohesion: 0.33
Nodes (9): EP11 · Dépenses et budget, US-110 · Saisir une dépense avec photo et rattachement, US-111 · Pré-autoriser les achats courants, US-112 · Dépenses au-dessus du seuil soumises, US-113 · Budget mensuel par catégorie, Budget mensuel par catégorie (seuil 80 %), Dépense DEP-xxxx avec rattachement obligatoire, Module Dépenses et budget (§5.8) (+1 more)

### Community 65 - "specifications"
Cohesion: 0.33
Nodes (9): EP12 · Personnel et paie, US-120 · Fiches employés et brouillon de paie pré-calculé, US-121 · Absences proposées depuis le planning, US-122 · Gains et pénalités multiples, US-123 · Valider l'état de paie, US-124 · Payer la paie et obtenir les bulletins, État de paie (Brouillon → Soumis → Validé → Payée), Module Personnel et paie (§5.10) (+1 more)

### Community 66 - ".github"
Cohesion: 0.22
Nodes (8): Closes # (link to récit), DoD: server-side rights per profile, action traced in journal, DoD: works offline (except queued sends), DoD: FR and EN texts, Pull request template, allowBuilds: esbuild, minimumReleaseAgeExclude (@tanstack, i18next, react-router), pnpm project settings (single package)

### Community 67 - "api"
Cohesion: 0.56
Nodes (9): docs service (Sphinx docs, port 9000), Local Docker Compose stack (optiboul), local celerybeat service, local celeryworker service, local django service (port 8000), local flower service, mailpit service, local postgres service (+1 more)

### Community 68 - "api"
Cohesion: 0.42
Nodes (9): API production Docker Compose stack, awscli service (postgres backups), production celerybeat service, production celeryworker service, production django service, production flower service, production postgres service, production redis service (+1 more)

### Community 70 - "web/e2e/visuel"
Cohesion: 0.28
Nodes (7): definirScenario (scenarios/index.ts), outils.ts (cliquer, attendrePolices), Mode simulation de l'application (vite --mode simulation), Banc de contrôle visuel : prototype contre application (pnpm e2e:visuel), CI : un job par application (api, web), Prototype cliquable OptiBoul ERP v2 (.dc.html), support.js (moteur d'exécution des prototypes)

### Community 71 - ".pre-commit-config.yaml"
Cohesion: 0.25
Nodes (7): pre-commit job, django-upgrade (target 6.0), djLint (Django templates), pre-commit configuration, pre-commit-hooks (whitespace, yaml, private key…), pyproject-fmt, Ruff check + format

### Community 72 - ".github/workflows"
Cohesion: 0.25
Nodes (7): Bout en bout (E2E) workflow, playwright job, make certs (mkcert local certificate), Default TLS certificate (mkcert optiboul.pem), OptiBoul web entry HTML (#root, lang fr), Root production Docker Compose (boulangerie local server), web service (apps/web build)

### Community 73 - "adr"
Cohesion: 0.25
Nodes (6): Espaces web (/connexion, /comptoir, /atelier, /gestion), Chargement des espaces à la demande (React.lazy), ProfilGroupe (profil de droits porté par le groupe), apps/web/src/profils.ts (profil -> espaces et écran d'arrivée, O10), GET /api/v1/users/me/ (renvoie le profil), En-tête X-OptiBoul-Entree: distante

### Community 74 - "adr"
Cohesion: 0.29
Nodes (4): django-allauth headless (client app, jeton de session), Application mobile pilotage (Expo SDK 58 + Expo Router), API versionnée /api/v1/, LANGUAGE_CODE fr, fuseau Africa/Douala

### Community 75 - "web"
Cohesion: 0.29
Nodes (6): ignorePatterns, plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 76 - "README.md"
Cohesion: 0.33
Nodes (4): oxlint (no-restricted-imports), Livrables de design OptiBoul (export Claude Design), Commits conventionnels, une branche par récit, PR vers develop, OptiBoul ERP

### Community 77 - "infra"
Cohesion: 0.53
Nodes (6): Traefik (mkcert, routage par préfixe, entrée distante), Accès distant par tunnel (Cloudflare Tunnel ou Tailscale), Service Cloudflare Tunnel (profil distant, cible traefik:8443), Infrastructure (serveur local de la boulangerie), Certificat HTTPS local (make certs, mkcert), Origine unique en production (Traefik route /api, /accounts, /static vers Django)

### Community 78 - "adr"
Cohesion: 0.40
Nodes (5): apps/api (API Django REST, Cookiecutter), Schéma OpenAPI apps/api/schema.yml, Client API généré par orval (apps/web/src/api), Anciens paquets @optiboul/* (packages/), Commandes Makefile (install, up, test, lint, api-client, e2e, prod-build)

### Community 79 - "specifications"
Cohesion: 0.40
Nodes (5): CI GitHub Actions filtrée par Turborepo, import-linter (règle de dépendance Clean Architecture en CI), Paquet packages/api-client (client et hooks générés orval), Paquet packages/testing (mocks MSW), Contrat API backend/schema.yml (drf-spectacular)

### Community 82 - "specifications"
Cohesion: 0.50
Nodes (4): Ressource API /auth/ (login-pin, verify-otp, totp, switch-user, trusted-devices), Application Django users (comptes, groupes, postes, MFA), Droits : groupe Django → profil + affectation de semaine (EstGerantDeLaSemaine), Table poste_confiance

### Community 84 - "web"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Ambiguous Edges - Review These
- `OptiBoul ERP — Cahier des charges v5` → `OptiBoul ERP — Profils, parcours utilisateurs et UX (v3)`  [AMBIGUOUS]
  docs/specifications/OptiBoul_ERP_Parcours_utilisateurs_UX_v3.md · relation: conceptually_related_to
- `Navigation : entrées du menu par profil et par lot` → `ADR-10 Cinq applications React par usage`  [AMBIGUOUS]
  docs/specifications/OptiBoul_ERP_Parcours_utilisateurs_UX_v3.md · relation: conceptually_related_to
- `DoD: server-side rights per profile, action traced in journal` → `X-OptiBoul-Entree header`  [AMBIGUOUS]
  .github/pull_request_template.md · relation: conceptually_related_to
- `DoD: FR and EN texts` → `minimumReleaseAgeExclude (@tanstack, i18next, react-router)`  [AMBIGUOUS]
  apps/web/pnpm-workspace.yaml · relation: conceptually_related_to

## Knowledge Gaps
- **54 isolated node(s):** `optiboul`, `@types/node`, `@types/react`, `@types/react-dom`, `jsdom` (+49 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 658 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **120 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `web service (apps/web build)` connect `.github/workflows` to `Routage Traefik et accès distant`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Are the 25 inferred relationships involving `User` (e.g. with `user()` and `SocialAccountAdapter`) actually correct?**
  _`User` has 25 INFERRED edges - model-reasoned connections that need verification._
- **What connects `optiboul`, `@types/node`, `@types/react` to the rest of the system?**
  _54 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tests de bout en bout Playwright` be split into smaller, more focused modules?**
  _Cohesion score 0.051462904911180773 - nodes in this community are weakly interconnected._
- **Why does `OptiBoul web entry HTML (#root, lang fr)` connect `.github/workflows` to `Espaces de l'application web`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `OptiBoul ERP — Cahier des charges v5` and `OptiBoul ERP — Profils, parcours utilisateurs et UX (v3)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Navigation : entrées du menu par profil et par lot` and `ADR-10 Cinq applications React par usage`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._