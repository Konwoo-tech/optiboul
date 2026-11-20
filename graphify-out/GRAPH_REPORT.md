# Graph Report - optiboul  (2026-11-02)

## Corpus Check
- 463 files · ~279,354 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 7104 nodes · 20837 edges · 293 communities (177 shown, 116 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 1762 edges (avg confidence: 0.93)
- Token cost: 209,740 input · 46,737 output

## Community Hubs (Navigation)
- API : caisses, manquants, sérialiseurs
- Modèles de caisse et registres clients
- Relances clients et notifications
- Tests des écrans atelier (simulation)
- Application web : espaces et inactivité
- Tests fournisseurs et clôture forcée
- Tests de clôture de semaine
- Atelier : affichage de la production
- API production : plans et consommations
- Atelier : affichage des stocks
- Démarrage Django (WSGI, manage.py)
- Dépenses, budget et autorisations
- Comptoir : session et brouillons
- Comptoir : appels API des caisses
- Écrans de connexion
- Ouverture automatique de la semaine
- API clients : dettes et relevés
- Simulation : calcul du plan
- Contrôles de clôture de caisse
- API encaissements
- ADR et exploitation
- Domaine des demandes de validation
- Gestion : tableau de bord
- API manquants fournisseurs
- Stocks : saisies et numérotation
- Scripts GitHub (backlog, tableau)
- API fournisseurs et factures
- Clients habituels sans commande
- Décision et escalade des demandes
- Cas d'usage production
- Écran clients et dettes
- API connexion et authentification
- Atelier : appels API production
- Comptoir : dépenses et budget
- Calcul de la paie
- Simulation : stock à date
- Réponses d'argent idempotentes
- API commandes et tarifs
- Registre des comptes clients
- Comptoir : écran des demandes
- Parcours UX et optimisations
- Espaces web et utilisateur courant
- Simulation : comptoir
- Réceptions et factures fournisseurs
- Applications Django par domaine
- api/optiboul
- core/api
- users
- depenses/api
- production/domain
- web/e2e/visuel
- users
- production/application
- users/tests
- demandes/api
- core/api
- production/domain
- specifications
- api/compose/production/traefik
- users/tests
- users
- notifications/api
- api
- simulation
- web/e2e/visuel/scenarios
- web
- caisse/application
- production/application
- core/application
- caisse/api
- rapports/api
- simulation
- achats/application
- simulation
- achats/tests
- stocks/api
- specifications
- ventes/application
- users
- core/application
- stocks/application
- web/e2e/visuel/scenarios
- .github/ISSUE_TEMPLATE
- stocks/infrastructure
- ventes/infrastructure
- utils
- espaces/gestion/semaines
- specifications
- users
- api/compose/production/postgres/maintena
- caisse/application
- web/e2e/visuel/scenarios
- espaces/gestion/semaines
- specifications
- caisse/domain
- paie/application
- paie/application
- rapports/tests
- users/domain
- users/tests
- ventes/domain
- espaces/comptoir/session
- specifications
- clients/tests
- ventes/application
- specifications
- stocks/infrastructure
- ventes/application
- web/e2e/visuel/scenarios
- paie/infrastructure
- README.md
- clients/domain
- notifications/api
- production/tests
- stocks/api
- stocks/tests
- ventes/api
- core/infrastructure
- core/domain
- core/application
- production/api
- rapports/infrastructure
- stocks/application
- users
- web
- web
- core/infrastructure
- web/e2e/visuel/scenarios
- espaces/gestion/semaines
- achats/tests
- users
- paie/application
- simulation
- espaces/gestion/semaines
- specifications
- paie/tests
- users/api
- caisse/tests
- clients/application
- users/api
- production/application
- ventes/tests
- web/e2e/visuel/scenarios
- web/e2e/visuel/scenarios
- simulation
- users/tests/api
- users
- caisse/tests
- users/api
- rapports/domain
- web/e2e/visuel/scenarios
- specifications
- core/tests
- paie/tests
- stocks/domain
- users/api
- users/tests
- web/e2e/visuel/scenarios
- paie/tests
- rapports/api
- rapports/api
- stocks/api
- web/e2e/visuel
- specifications
- specifications
- caisse/infrastructure
- core/infrastructure
- core/tests
- clients/tests
- rapports/api
- users/tests
- specifications
- api
- caisse/tests
- core/api
- core/api
- core/tests
- depenses/tests
- rapports/tests
- api/config
- rapports/api
- users/api
- users
- simulation
- core/api
- users
- core/infrastructure
- production/tests
- users/tests
- web
- core
- users/tests/api
- adr
- production/tests
- ventes/infrastructure
- web
- api/compose/production/postgres/maintena
- api/compose/production/postgres/maintena
- ventes/tests
- api/.devcontainer
- core/api
- core/api
- core/domain
- demandes/api
- api

## God Nodes (most connected - your core abstractions)
1. `Auteur` - 223 edges
2. `RefusMetier` - 203 edges
3. `LigneJournal` - 148 edges
4. `auteur_de()` - 123 edges
5. `User` - 120 edges
6. `Session` - 119 edges
7. `journaliser()` - 90 edges
8. `formaterNombre()` - 86 edges
9. `probleme()` - 79 edges
10. `Evenement` - 77 edges

## Surprising Connections (you probably didn't know these)
- `Vérification manuelle de l'accès distant` --semantically_similar_to--> `Workflow CI`  [INFERRED] [semantically similar]
  docs/acces-distant.md → .github/workflows/ci.yml
- `Mailpit (serveur SMTP local de test)` --semantically_similar_to--> `Mailgun (django-anymail)`  [INFERRED] [semantically similar]
  apps/api/README.md → docs/adr/ADR-14-aws-mailgun.md
- `Essai de restauration dans une base jetable` --semantically_similar_to--> `Vérification que le contrat API est à jour`  [INFERRED] [semantically similar]
  docs/restauration.md → .github/workflows/ci.yml
- `Volume production_sauvegardes` --semantically_similar_to--> `Sauvegarde PostgreSQL vers S3`  [INFERRED] [semantically similar]
  apps/api/docker-compose.production.yml → infra/README.md
- `Job web` --conceptually_related_to--> `Service traefik (production)`  [AMBIGUOUS]
  .github/workflows/ci.yml → apps/api/docker-compose.production.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Cycle de production d'une session (commandes → plan → validation → réalisé → clôture → sorties de stock)** — docs_specifications_optiboul_erp_cahier_des_charges_v5_heure_limite_commandes, docs_specifications_optiboul_erp_cahier_des_charges_v5_plan_production, docs_specifications_optiboul_erp_cahier_des_charges_v5_demande_estimee, docs_specifications_optiboul_erp_cahier_des_charges_v5_augmentation_production, docs_specifications_optiboul_erp_cahier_des_charges_v5_o6, docs_specifications_optiboul_erp_cahier_des_charges_v5_r4, docs_specifications_optiboul_erp_cahier_des_charges_v5_r5, docs_specifications_optiboul_erp_cahier_des_charges_v5_consommation_reelle, docs_specifications_optiboul_erp_cahier_des_charges_v5_reste_a_produire [EXTRACTED 1.00]
- **Circuit de demande de validation avec escalade au propriétaire** — docs_specifications_optiboul_erp_cahier_des_charges_v5_module_demandes_validation, docs_specifications_optiboul_erp_cahier_des_charges_v5_demande_dem, docs_specifications_optiboul_erp_cahier_des_charges_v5_o5, docs_specifications_optiboul_erp_cahier_des_charges_v5_r19, docs_specifications_optiboul_erp_backlog_produit_v2_us_070, docs_specifications_optiboul_erp_backlog_produit_v2_us_071, docs_specifications_optiboul_erp_backlog_produit_v2_us_072 [EXTRACTED 1.00]
- **Affichage selon le profil, droits vérifiés par l'API** — docs_adr_adr_18_application_web_unique_profil_groupe, docs_adr_adr_18_application_web_unique_users_me_endpoint, docs_adr_adr_18_application_web_unique_profils_ts, docs_adr_adr_18_application_web_unique_espaces, docs_adr_adr_18_application_web_unique_server_side_rights [EXTRACTED 1.00]
- **Comptoir sans dépendance à internet (file d'envoi, TOTP, hors ligne)** — docs_specifications_optiboul_erp_cahier_des_charges_v5_o15, docs_specifications_optiboul_erp_cahier_des_charges_v5_r22, docs_specifications_optiboul_erp_cahier_des_charges_v5_file_envoi, docs_specifications_optiboul_erp_cahier_des_charges_v5_totp_codes_secours, docs_specifications_optiboul_erp_backlog_produit_v2_us_141, docs_specifications_optiboul_erp_backlog_produit_v2_us_140, docs_specifications_optiboul_erp_cahier_des_charges_v5_bon_de_livraison [INFERRED 0.85]
- **Accès distant sécurisé (tunnel, Traefik, entrée distante, double authentification)** — docs_adr_adr_19_sans_application_mobile_remote_access_tunnel, docs_adr_adr_15_versions_socle_traefik, docs_adr_adr_19_sans_application_mobile_entree_distante_header, docs_adr_adr_19_sans_application_mobile_mfa_distante [INFERRED 0.85]
- **Chaîne d'authentification OptiBoul (poste, code, 2FA, entrée, droits)** — docs_specifications_optiboul_erp_specification_technique_architecture_v4_poste_de_confiance, docs_specifications_optiboul_erp_specification_technique_architecture_v4_code_4_chiffres, docs_specifications_optiboul_erp_specification_technique_architecture_v4_double_authentification, docs_specifications_optiboul_erp_specification_technique_architecture_v4_entree_distante, docs_specifications_optiboul_erp_specification_technique_architecture_v4_droits, docs_specifications_optiboul_erp_specification_technique_architecture_v4_profilgroupe [EXTRACTED 1.00]
- **Chaîne du contrat OpenAPI : API, schema.yml, client généré, CI, simulation** — docs_specifications_optiboul_erp_specification_technique_architecture_v4_apps_api, docs_specifications_optiboul_erp_specification_technique_architecture_v4_contrat_api, docs_specifications_optiboul_erp_specification_technique_architecture_v4_apps_web, docs_specifications_optiboul_erp_specification_technique_architecture_v4_ci_github_actions, docs_specifications_optiboul_erp_specification_technique_architecture_v4_mode_simulation [EXTRACTED 1.00]
- **Une seule application web à espaces (ADR-18, ADR-19, ADR-20)** — docs_specifications_optiboul_erp_specification_technique_architecture_v4_un_seul_client, docs_specifications_optiboul_erp_specification_technique_architecture_v4_apps_web, docs_specifications_optiboul_erp_specification_technique_architecture_v4_espaces_par_profil, docs_adr_adr_18_application_web_unique_adr_18, docs_adr_adr_19_sans_application_mobile_adr_19, docs_adr_adr_20_web_autonome_adr_20 [EXTRACTED 1.00]
- **Flux d'accès distant : tunnel sortant, entrée remote et bridage de l'authentification** — docs_acces_distant_acces_distant_tunnel, docs_acces_distant_cloudflare_tunnel, docs_acces_distant_profil_distant, apps_api_compose_production_traefik_traefik_entrypoint_remote, apps_api_compose_production_traefik_traefik_router_django_distant, apps_api_compose_production_traefik_traefik_middleware_entree_distante, apps_api_compose_production_traefik_traefik_en_tete_x_optiboul_entree, docs_acces_distant_refus_code_4_chiffres [EXTRACTED 1.00]
- **Chaîne de sauvegarde et de restauration : copies locales, copie cloud chiffrée, essai puis remplacement** — apps_api_docker_compose_production_celerybeat, apps_api_docker_compose_production_celeryworker, apps_api_docker_compose_production_volume_sauvegardes, apps_api_docker_compose_production_awscli, docs_restauration_dossier_sauvegardes, docs_restauration_cle_sauvegarde, docs_restauration_commande_restaurer_sauvegarde, docs_restauration_perte_maximale_4h [INFERRED 0.85]
- **Portes de qualité avant livraison : hooks, tests ciblés, couverture du domaine et contrat API** — _pre_commit_config_hooks_pre_commit, _github_workflows_ci_pre_commit, _github_workflows_ci_changements, _github_workflows_ci_api, _github_workflows_ci_web, _github_workflows_ci_seuil_couverture_domaine, _github_workflows_ci_verification_contrat_api, readme_commandes_make [EXTRACTED 1.00]

## Communities (293 total, 116 thin omitted)

### Community 0 - "API : caisses, manquants, sérialiseurs"
Cohesion: 0.04
Nodes (46): ProchaineSerializer, ResultatFermetureSerializer, ProblemeSerializer, ParametreSerializer, profil_de(), ProfilParmi(), has_permission(), EtatSauvegardesSerializer (+38 more)

### Community 1 - "Modèles de caisse et registres clients"
Cohesion: 0.03
Nodes (51): Caisse, Meta, historique(), ClientSerializer, Meta, plafond_du_client(), prix_du_client(), relance_due() (+43 more)

### Community 2 - "Relances clients et notifications"
Cohesion: 0.03
Nodes (50): test_relance_groupee_et_statut_d_envoi(), test_relance_individuelle(), test_seuls_gerant_et_proprietaire_relancent(), test_texte_de_la_relance(), fcfa(), TelephonesDjango, FileEnvoi, Canal (+42 more)

### Community 3 - "Tests des écrans atelier (simulation)"
Cohesion: 0.04
Nodes (81): ouvrir(), ouvrir(), Adresse(), ECRAN, ouvrir(), fermerEnTantQueGerant(), fermerPuisOuvrirLaModale(), monter() (+73 more)

### Community 4 - "Application web : espaces et inactivité"
Cohesion: 0.04
Nodes (77): App(), Atelier, Comptoir, Connexion, Gestion, EVENEMENTS, Options, monter() (+69 more)

### Community 5 - "Tests fournisseurs et clôture forcée"
Cohesion: 0.03
Nodes (68): test_fiche_fournisseur(), test_planification_verifiee(), _forcer(), test_cloture_forcee_avec_caisse_ouverte(), test_reserve_au_proprietaire_avec_motif(), test_fonds_de_20_000_propose_et_caissiere_planifiee(), test_hors_planning_signale_au_gerant_et_trace(), test_la_caissiere_planifiee_ouvre_sa_caisse() (+60 more)

### Community 6 - "Tests de clôture de semaine"
Cohesion: 0.05
Nodes (47): caisse_ouverte(), _cloturer(), test_cloture_apres_fermeture_des_caisses(), test_controles_sans_caisse_ouverte(), test_les_a_voir_n_empechent_pas_et_les_actions_s_executent(), test_qui_cloture(), test_rappel_du_dimanche_au_gerant(), test_une_caisse_ouverte_bloque_la_cloture() (+39 more)

### Community 7 - "Atelier : affichage de la production"
Cohesion: 0.06
Nodes (83): dateCourte(), ecartEnPains(), jourComplet(), libelleProduit(), nomDeMatiere(), nomDeSessionCourt(), pourcentSigne(), uniteDeSaisie() (+75 more)

### Community 8 - "API production : plans et consommations"
Cohesion: 0.05
Nodes (40): parametre(), budget_du_mois(), ConsommationSerializer, FourneeSaisieSerializer, FourneeSerializer, LignePlanSerializer, MatiereConsommeeSerializer, PlanSerializer (+32 more)

### Community 9 - "Atelier : affichage des stocks"
Cohesion: 0.06
Nodes (75): codeInventaire(), jourCourt(), jourEtHeure(), libelleOrigine(), nomMatiere(), quantite(), resumeDesEcarts(), signeDuMouvement() (+67 more)

### Community 10 - "Démarrage Django (WSGI, manage.py)"
Cohesion: 0.04
Nodes (33): main(), merge(), _acces(), _base_administrative(), _connecter(), _en_clair(), _environnement(), essayer() (+25 more)

### Community 11 - "Dépenses, budget et autorisations"
Cohesion: 0.05
Nodes (39): Evenement, LigneBudgetSerializer, NouvelleDepenseSerializer, Autorisations, _caisse_qui_paie(), conclure(), DepenseSoumise, DepotDepenses (+31 more)

### Community 12 - "Comptoir : session et brouillons"
Cohesion: 0.06
Nodes (66): dateSansAnnee(), libelleDuMode(), nomDeSession(), BROUILLON_VIDE, BrouillonMouvement, calculerLivraison(), CalculLivraison, chiffres() (+58 more)

### Community 13 - "Comptoir : appels API des caisses"
Cohesion: 0.06
Nodes (61): cleCaisses(), JSON_ENTETES, Reponse, useActionCaisse(), useCaisses(), useFermerCaisse(), useOuvrirCaisse(), useRemettreAuCoffre() (+53 more)

### Community 14 - "Écrans de connexion"
Cohesion: 0.06
Nodes (56): ChoixCompteGoogle(), Props, ChoixUtilisateur(), Props, identifierSansDeuxFacteurs(), EcransSimules(), Props, FormulaireEmail() (+48 more)

### Community 15 - "Ouverture automatique de la semaine"
Cohesion: 0.04
Nodes (43): ouvrir_semaine(), _lundi_6h(), planifier(), test_alerte_si_la_semaine_n_est_pas_planifiee(), test_la_semaine_s_ouvre_seule_le_lundi_6h(), test_ouverture_par_le_gerant_affecte(), test_sinon_alerte_au_proprietaire(), test_une_seule_semaine_ouverte() (+35 more)

### Community 16 - "API clients : dettes et relevés"
Cohesion: 0.06
Nodes (23): ClientsViewSet, DettePlafondSerializer, DetteSerializer, DettesSerializer, EtatEnvoiSerializer, IgnoreSerializer, ImportClasseurSerializer, LigneReleveSerializer (+15 more)

### Community 17 - "Simulation : calcul du plan"
Cohesion: 0.09
Nodes (68): calculerDemande(), calculerPlan(), SEUIL_ECART_KG_PAR_SAC, abonnerOuvertureDeSession(), commandesDeLaSession(), heureCourante(), Acteur, adapterNotificationsALaProduction() (+60 more)

### Community 18 - "Contrôles de clôture de caisse"
Cohesion: 0.06
Nodes (37): archiver(), caisse_ouverte(), enregistrer(), jauge(), dettes_clients(), test_jauge_sans_plafond(), test_liste_des_dettes(), test_qui_voit_les_dettes() (+29 more)

### Community 19 - "API encaissements"
Cohesion: 0.05
Nodes (15): EncaissementsViewSet, NouvelEncaissementSerializer, paiement_de(), PaiementSerializer, ClientALivrerSerializer, EnvoiSerializer, Meta, _ligne() (+7 more)

### Community 20 - "ADR et exploitation"
Cohesion: 0.06
Nodes (29): Proxy Traefik OptiBoul, Celery worker et beat (config.celery_app), Mailpit (serveur SMTP local de test), OptiBoul API (Built with Cookiecutter Django), django-allauth headless (client app, jeton de session), Application mobile pilotage (Expo SDK 58 + Expo Router), AWS S3 (médias, sauvegardes, django-storages), Mailgun (django-anymail) (+21 more)

### Community 21 - "Domaine des demandes de validation"
Cohesion: 0.06
Nodes (32): Auteur, enregistrer_type(), ObjetLie, TypeDemande, types(), decisions(), mama(), _preparer() (+24 more)

### Community 22 - "Gestion : tableau de bord"
Cohesion: 0.08
Nodes (46): cheminAlerte(), formaterTaux(), jourDuMois(), jourOrdinal(), nomDuMois(), texteAlerte(), Alertes(), cleTableauDeBord() (+38 more)

### Community 23 - "API manquants fournisseurs"
Cohesion: 0.06
Nodes (27): ManquantSerializer, Meta, ManquantsViewSet, ReplanifierSerializer, _a_livrer(), DepotManquants, Depots, Envois (+19 more)

### Community 24 - "Stocks : saisies et numérotation"
Cohesion: 0.06
Nodes (24): MouvementStockSerializer, Meta, Depots, Numeros, saisir(), Stock, GenreMouvementStock, Sens (+16 more)

### Community 25 - "Scripts GitHub (backlog, tableau)"
Cohesion: 0.07
Nodes (19): cellules(), corps_epopee(), corps_recit(), dater_sprints(), Epopee, etiquette_epopee(), etiquettes_epopee(), etiquettes_recit() (+11 more)

### Community 26 - "API fournisseurs et factures"
Cohesion: 0.06
Nodes (21): FactureSerializer, Meta, FacturesViewSet, FournisseursViewSet, PaiementFournisseurSerializer, Meta, PaiementsFournisseursViewSet, PayerSerializer (+13 more)

### Community 27 - "Clients habituels sans commande"
Cohesion: 0.07
Nodes (24): Habituel, habituels(), Historique, reprendre_habituelle(), heure_limite(), Limites, session_visee(), commande_habituelle() (+16 more)

### Community 28 - "Décision et escalade des demandes"
Cohesion: 0.07
Nodes (20): decider(), DepotDemandes, Depots, emettre(), escalader_echues(), EtatDemande, Numeros, obtenir() (+12 more)

### Community 29 - "Cas d'usage production"
Cohesion: 0.07
Nodes (19): responsable_de(), cloturer(), DepotProductions, Depots, _en_cours(), EtatProduction, ouvrir(), saisir_consommation() (+11 more)

### Community 30 - "Écran clients et dettes"
Cohesion: 0.08
Nodes (48): DetailClient(), Props, quand(), Chiffres(), CLE_FILTRE, EcranClients(), LigneClient(), LigneProps (+40 more)

### Community 31 - "API connexion et authentification"
Cohesion: 0.10
Nodes (29): accepter_invitation(), annuler_identification(), changer_utilisateur(), CodeEnvoyeSerializer, connexion_google(), connexion_par_code(), connexion_par_email(), ConnexionCodeSerializer (+21 more)

### Community 32 - "Atelier : appels API production"
Cohesion: 0.05
Nodes (52): actionsDe(), ActionsProduction, AvecInstantane, cleFiches(), cleProduction(), codeErreur(), ENTETES, envoyer() (+44 more)

### Community 33 - "Comptoir : dépenses et budget"
Cohesion: 0.09
Nodes (46): libelleAuteur(), libelleDemande(), libelleRattachement(), libelleSession(), moisDuBudget(), Budget(), Formulaire(), Props (+38 more)

### Community 34 - "Calcul de la paie"
Cohesion: 0.06
Nodes (30): EtatPaieSerializer, Meta, absences_proposees(), Calcul, echeance_validation(), mois_precedent(), montant_absences(), EtatPaie (+22 more)

### Community 35 - "Simulation : stock à date"
Cohesion: 0.09
Nodes (51): ajouterJours(), arrondir(), DroitsStocks, effet(), lignesEnEcart(), numeroInventaire(), stockADate(), dateDuJour() (+43 more)

### Community 36 - "Réponses d'argent idempotentes"
Cohesion: 0.07
Nodes (20): probleme(), idempotent(), enveloppe(), _rejouer(), RequeteIdempotente, Meta, AbsencesProposeesSerializer, ElementPaieSerializer (+12 more)

### Community 37 - "API commandes et tarifs"
Cohesion: 0.08
Nodes (17): ClientResumeSerializer, masquer_telephone(), ClientDeLaSessionSerializer, CommandeSerializer, Meta, CommandesViewSet, HabituelSerializer, RappelSerializer (+9 more)

### Community 38 - "Registre des comptes clients"
Cohesion: 0.08
Nodes (37): MouvementCompte, Meta, EncaissementEnregistreSerializer, Meta, EncaissementSerializer, Meta, Encaissement, Meta (+29 more)

### Community 39 - "Comptoir : écran des demandes"
Cohesion: 0.08
Nodes (40): cleDemandes(), Reponse, useDecider(), useDemandes(), Bloc(), BlocProps, cheminVers(), Contexte (+32 more)

### Community 40 - "Parcours UX et optimisations"
Cohesion: 0.09
Nodes (28): OptiBoul ERP — Profils, parcours utilisateurs et UX (v3), États du système (hors ligne, notifications, reste à produire, verrouillé…), Navigation : entrées du menu par profil et par lot, Objectifs d'expérience (< 5 s, < 30 s, 0 retard de pétrissage, 0 FCFA d'écart), P0 Se connecter et changer d'utilisateur, P1 Planifier une semaine, P10 Clôturer la semaine et passer la main, P11 Suivre et décider à distance (+20 more)

### Community 41 - "Espaces web et utilisateur courant"
Cohesion: 0.08
Nodes (33): Atelier(), Comptoir(), cleDepenses(), codeErreur(), DepenseEnregistree, Reponse, useDepenses(), useEnregistrerDepense() (+25 more)

### Community 42 - "Simulation : comptoir"
Cohesion: 0.10
Nodes (44): FONDS_DE_CAISSE, Acteur, adapterNotificationsAuComptoir(), ajouterMouvement(), appliquerDecisionPlafond(), changementDeSession(), client(), clientsDeDepart() (+36 more)

### Community 43 - "Réceptions et factures fournisseurs"
Cohesion: 0.07
Nodes (12): DepotAchats, Depots, Numeros, Planifiee, receptionner(), Recue, ecart(), montant() (+4 more)

### Community 44 - "Applications Django par domaine"
Cohesion: 0.05
Nodes (13): AchatsConfig, CaisseConfig, ClientsConfig, CoreConfig, DemandesConfig, DepensesConfig, NotificationsConfig, PaieConfig (+5 more)

### Community 45 - "api/optiboul"
Cohesion: 0.07
Nodes (25): s45_patrick(), semaine_cloturee(), administrateur(), _cache_vide(), caisse_ouverte(), caissiere(), client_de(), gerant() (+17 more)

### Community 46 - "core/api"
Cohesion: 0.06
Nodes (17): _cle_connue(), ModificationSerializer, ParametresViewSet, _projeter(), ValeurSerializer, DepotParametres, EtatParametre, etats() (+9 more)

### Community 47 - "users"
Cohesion: 0.09
Nodes (21): decideur_de(), _terminer_ou_demander(), _bloque(), Identifie, ouvrir_session(), RefusConnexion, utilisateurs_du_poste(), verifier_code() (+13 more)

### Community 48 - "depenses/api"
Cohesion: 0.06
Nodes (11): BudgetSerializer, BudgetsViewSet, FixerBudgetSerializer, premier_jour(), DepensesViewSet, PlafondsSerializer, _pre_autorisations(), PreAutorisationSerializer (+3 more)

### Community 49 - "production/domain"
Cohesion: 0.08
Nodes (25): DepotFiches, nouvelle_version(), _trace(), verifier_droit(), VersionFiche, boules(), boules_par_sac(), cout_de_revient() (+17 more)

### Community 50 - "web/e2e/visuel"
Cohesion: 0.06
Nodes (31): arguments_, fichiers, inconnus, largeurNom, Ligne, lignes, options, retenus (+23 more)

### Community 51 - "users"
Cohesion: 0.07
Nodes (14): CompteCreeSerializer, Meta, CompteSerializer, Meta, UserManager, Profil, User, test_user_detail() (+6 more)

### Community 52 - "production/application"
Cohesion: 0.10
Nodes (19): _annoncer(), calculer(), DepotPlans, Depots, _plan_propose(), PlanCalcule, PlanEnregistre, proposer() (+11 more)

### Community 53 - "users/tests"
Cohesion: 0.08
Nodes (23): _routeurs_distants(), test_chaque_entree_impose_son_en_tete(), test_hsts_coherent_entre_django_et_traefik(), test_rien_d_administratif_sur_l_entree_distante(), traefik(), NouveauCompteSerializer, apercu(), CompteInvalide (+15 more)

### Community 54 - "demandes/api"
Cohesion: 0.09
Nodes (16): DemandeSerializer, Meta, DemandesViewSet, EmissionSerializer, visibles(), Demande, Meta, valideurs() (+8 more)

### Community 55 - "core/api"
Cohesion: 0.11
Nodes (9): auteur_de(), AffectationsSerializer, ClotureForceeSerializer, _pk(), PlacementSerializer, PlanificationSerializer, SemainesViewSet, demander_sauvegarde() (+1 more)

### Community 56 - "production/domain"
Cohesion: 0.07
Nodes (22): dans_la_tolerance(), decision_automatique(), Demande, heure_validation_auto(), ligne(), moyenne(), moyennes_par_produit(), sacs_pour() (+14 more)

### Community 57 - "specifications"
Cohesion: 0.07
Nodes (37): OptiBoul ERP — Backlog produit v2, EP00 · Socle technique, EP13 · Tableau de bord et rapports, EP15 · Reprise et mise en service, GitHub Actions (CI), Jalons d'acceptation, Lot 0 · Socle technique, Lot 1 · Ventes, dettes, production de base, fournisseurs, dépenses (+29 more)

### Community 58 - "api/compose/production/traefik"
Cohesion: 0.06
Nodes (38): Hook detect-private-key, En-tête X-OptiBoul-Entree, Point d'entrée flower (:5555), Point d'entrée remote (:8443), Point d'entrée web-secure (:443), Middleware csrf, Middleware entree-distante, Middleware entree-locale (+30 more)

### Community 59 - "users/tests"
Cohesion: 0.07
Nodes (8): UserAdminChangeForm, Meta, TestUserDetailView, TestUserRedirectView, TestUserUpdateView, UserDetailView, UserRedirectView, UserUpdateView

### Community 60 - "users"
Cohesion: 0.08
Nodes (18): SauvegardesViewSet, journaliser(), _auteur(), test_filtres_auteur_type_et_periode(), test_le_journal_refuse_modification_et_suppression(), test_reserve_a_la_direction_et_a_l_administrateur(), test_une_action_est_tracee_avec_avant_apres(), PosteConfiance (+10 more)

### Community 61 - "notifications/api"
Cohesion: 0.09
Nodes (14): GroupeNotificationsSerializer, MarquerGroupeNotificationsSerializer, NotificationSerializer, Meta, NotificationsViewSet, _projeter(), RegleSerializer, ReglesNotificationViewSet (+6 more)

### Community 62 - "api"
Cohesion: 0.09
Nodes (23): creerClientRequetes(), echec(), configuration, ConfigurationApi, configurerApi(), COOKIES_CSRF, envoyer(), ErreurApi (+15 more)

### Community 63 - "simulation"
Cohesion: 0.14
Nodes (40): semaineDuJour(), lectureCaisses(), reouvertureDeSession(), sessionOuverteDuComptoir(), demandesEnAttente(), depensesDeSemaine(), affecter(), lirePlanning() (+32 more)

### Community 64 - "web/e2e/visuel/scenarios"
Cohesion: 0.09
Nodes (36): enregistrer(), clore(), appel(), changerDePersonne(), cloturerLaSemaine(), confirmerLaCloture(), CONTENU, CORPS (+28 more)

### Community 65 - "web"
Cohesion: 0.05
Nodes (40): dependencies, @fontsource-variable/manrope, i18next, @mantine/core, @mantine/hooks, react, react-dom, react-i18next (+32 more)

### Community 66 - "caisse/application"
Cohesion: 0.11
Nodes (16): _caisse(), Depots, enregistrer_mouvement(), Especes, fermer(), ouvrir(), Prochaine, remettre() (+8 more)

### Community 67 - "production/application"
Cohesion: 0.09
Nodes (14): verifier_supplement(), ajouter(), _annoncer_decision(), Autorisations, conclure(), Depots, DepotSupplements, EtatSupplement (+6 more)

### Community 68 - "core/application"
Cohesion: 0.10
Nodes (17): CreneauSerializer, PersonneSerializer, _planning(), copier_precedent(), DepotPlanning, etat(), EtatPlanning, peut_planifier() (+9 more)

### Community 69 - "caisse/api"
Cohesion: 0.11
Nodes (11): CaisseSerializer, Meta, CaissesViewSet, CaissiereSerializer, _especes(), EspecesSerializer, FermetureSerializer, OuvertureSerializer (+3 more)

### Community 70 - "rapports/api"
Cohesion: 0.09
Nodes (19): BudgetCategorieSerializer, _debut_local(), _graphiques(), GraphiquesSerializer, _indicateurs(), IndicateursSerializer, _marge(), MargeSerializer (+11 more)

### Community 71 - "simulation"
Cohesion: 0.12
Nodes (36): numeroDepense(), peutDecider(), SEUIL_PAR_DEFAUT, Fournisseur, Semaine, repercuterDepenseEnCaisse(), abonnerChangementDeSession(), repercuterDepenseDeSession() (+28 more)

### Community 72 - "achats/application"
Cohesion: 0.09
Nodes (12): Depenses, DepotFactures, Depots, EtatFacture, payer(), statut_apres_paiement(), StatutFacture, Reception (+4 more)

### Community 73 - "simulation"
Cohesion: 0.15
Nodes (35): attenduDeCaisse(), Acteur, ajouterUnJour(), archives, ARCHIVES_INITIALES(), caissieres(), Corps, Courante (+27 more)

### Community 74 - "achats/tests"
Cohesion: 0.09
Nodes (20): FournisseurSerializer, Meta, Fournisseur, Meta, ReceptionPlanifiee, Meta, minoterie(), facture() (+12 more)

### Community 75 - "stocks/api"
Cohesion: 0.07
Nodes (6): ComptesSerializer, ControlesStockViewSet, MatiereACompterSerializer, Meta, MatieresViewSet, Unite

### Community 76 - "specifications"
Cohesion: 0.12
Nodes (31): EP03 · Semaines et planning, EP04 · Caisses, US-030 · Planifier une semaine et copier la précédente, US-031 · Planning des caisses 7 jours × jour/nuit, US-032 · Ouverture automatique de la semaine le lundi 06:00, US-033 · Clôture de semaine avec contrôles bloquants, US-034 · Rapport de passation en PDF, US-035 · Clôture forcée avec motif (+23 more)

### Community 77 - "ventes/application"
Cohesion: 0.13
Nodes (16): Autorisations, caisse_de_saisie(), compte_du_client(), DepotEncaissements, Depots, encaisser(), _encaisser(), EtatEncaissement (+8 more)

### Community 78 - "users"
Cohesion: 0.09
Nodes (14): activer_totp(), _authentificateur(), desactiver_totp(), etat(), preparer_totp(), regenerer_codes(), verifier_second_facteur(), code_totp() (+6 more)

### Community 79 - "core/application"
Cohesion: 0.11
Nodes (11): cloturer(), cloturer_forcee(), Journal, ouvrir(), ouvrir_automatiquement(), peut_ouvrir_ou_cloturer(), code(), raisons_de_ne_pas_ouvrir() (+3 more)

### Community 80 - "stocks/application"
Cohesion: 0.12
Nodes (8): DepotControles, EtatControle, LigneSoumise, PorteeControle, StatutControle, StatutLigne, DepotControlesDjango, etat()

### Community 81 - "web/e2e/visuel/scenarios"
Cohesion: 0.10
Nodes (27): attendreLaFinDuMessage(), caisseOuverte, caissier, connecterDansLApplication(), connecterDansLePrototype(), CONTENU, fermerDansLApplication(), fermerDansLePrototype() (+19 more)

### Community 82 - ".github/ISSUE_TEMPLATE"
Cohesion: 0.07
Nodes (29): Anomalie issue template, Cahier des charges (CdC), Constat field (application, profil, étapes, résultat), Règle ou parcours concerné (R…, P…), Issue template config (blank issues enabled), Critères d'acceptation, User story format (En tant que… je veux… afin de…), Priorité MoSCoW (Must, Should, Could) (+21 more)

### Community 83 - "stocks/infrastructure"
Cohesion: 0.12
Nodes (14): Consommation, Meta, sessions_restantes(), statut_stock(), StatutStock, valeur_stock(), besoins_par_session(), etat_du_stock() (+6 more)

### Community 84 - "ventes/infrastructure"
Cohesion: 0.13
Nodes (13): conclure_autorisation(), DepotLivraisons, EtatLivraison, _livraison_en_attente(), Ligne, lignes_facturees(), montant_du(), StatutLivraison (+5 more)

### Community 85 - "utils"
Cohesion: 0.11
Nodes (21): ActionsClavier, useRaccourcis(), CORPS, Props, chocolat, NIVEAUX, or, resolveurVariablesOptiboul() (+13 more)

### Community 86 - "espaces/gestion/semaines"
Cohesion: 0.12
Nodes (24): CarteSemaine(), ChampEquipe, Equipier(), Props, texteDeLaRaison(), aDesBloquants(), CRENEAUX_PAR_SEMAINE, DroitsSemaines (+16 more)

### Community 87 - "specifications"
Cohesion: 0.09
Nodes (13): EP01 · Authentification et sécurité, US-010 · Connexion nom + code à 4 chiffres sur poste de confiance, US-011 · Double authentification SMS/WhatsApp pour le gérant, US-012 · Connexion sans réseau par TOTP ou code de secours, US-013 · Connexion Google du propriétaire à distance, US-014 · Changer d'utilisateur sans perdre la saisie, US-015 · Réinitialiser le mot de passe, US-022 · Enregistrer / révoquer un poste de confiance (+5 more)

### Community 88 - "users"
Cohesion: 0.08
Nodes (10): GroupeAdmin, ProfilGroupeInline, UserAdmin, UserAdminCreationForm, Meta, UserSignupForm, UserSocialSignupForm, ProfilGroupe (+2 more)

### Community 89 - "api/compose/production/postgres/maintena"
Cohesion: 0.10
Nodes (6): constants.sh script, message_error(), message_info(), message_success(), message_welcome(), messages.sh script

### Community 90 - "caisse/application"
Cohesion: 0.10
Nodes (5): DepotCaisses, EtatCaisse, DepotCaissesDjango, etat(), DepotEncaissementsDjango

### Community 91 - "web/e2e/visuel/scenarios"
Cohesion: 0.11
Nodes (27): scenarioDepenses(), allerA(), conso(), CONTENU, ecrireEtatDuPrototype(), Etape, Etapes, ETATS_PROTOTYPE (+19 more)

### Community 92 - "espaces/gestion/semaines"
Cohesion: 0.16
Nodes (23): jourEtHeure(), jourMois(), jourSemaine(), premier(), Historique(), Props, Commun, ModaleCloture() (+15 more)

### Community 93 - "specifications"
Cohesion: 0.12
Nodes (27): EP05 · Commandes et livraisons, EP06 · Clients et dettes, US-050 · Saisir les commandes et reprendre celles de la veille, US-051 · Recherche client et « Livrer comme commandé », US-052 · Encaisser espèces / MoMo / Orange Money, US-053 · Blocage au-delà du plafond de dette, US-055 · Mouvements internes avec motif, US-057 · Clients habituels sans commande et relance automatique (+19 more)

### Community 94 - "caisse/domain"
Cohesion: 0.12
Nodes (14): attendu_en_caisse(), ecart_caisse(), remise_coffre_proposee(), ResultatFermeture, StatutEcart, test_caisse_en_manque(), test_caisse_juste(), test_ecart_est_compte_moins_attendu() (+6 more)

### Community 95 - "paie/application"
Cohesion: 0.16
Nodes (15): RefusMetier, ajouter_element(), Autorisations, conclure(), Depots, _element_en_brouillon(), exiger_brouillon(), _gerant() (+7 more)

### Community 96 - "paie/application"
Cohesion: 0.10
Nodes (3): DepotPaie, StatutPaie, DepotPaieDjango

### Community 97 - "rapports/tests"
Cohesion: 0.14
Nodes (15): comparer(), Ecart, Totaux, _jour(), rapprocher(), totaux_excel(), _envoyer(), _excel() (+7 more)

### Community 98 - "users/domain"
Cohesion: 0.14
Nodes (14): apres_echec(), apres_reussite(), essais_par_jour_au_plus(), EtatVerrou, test_cinq_echecs_bloquent_quinze_minutes(), test_dix_mille_combinaisons_impossibles_a_enchainer(), test_echecs_et_verrouillage_journalises(), test_l_administrateur_debloque() (+6 more)

### Community 99 - "users/tests"
Cohesion: 0.11
Nodes (14): double_auth_requise(), renvoi_dans(), CodeVerification, Meta, _code_envoye(), comptoir(), test_code_expire(), test_connexion_par_email_toujours_en_deux_etapes() (+6 more)

### Community 100 - "ventes/domain"
Cohesion: 0.15
Nodes (13): DepotMouvementsInternes, enregistrer_mouvement_interne(), GenreMouvementInterne, MouvementInterne, totaux(), verifier_mouvement(), DepotMouvementsInternesDjango, _saisir() (+5 more)

### Community 101 - "espaces/comptoir/session"
Cohesion: 0.13
Nodes (21): ActionsSession, cleSession(), codeErreur(), ENTETES, envoyer(), lire(), NouveauMouvement, NouvelleLivraison (+13 more)

### Community 102 - "specifications"
Cohesion: 0.10
Nodes (20): Expo Notifications (APNs / FCM), Notifications SMS / WhatsApp (O5), Celery / Celery Beat, Cookiecutter Django (DRF, Celery, Docker), EP14 · Hors ligne, sauvegardes et file d'envoi, PostgreSQL, React (Vite, TypeScript), Redis (+12 more)

### Community 103 - "clients/tests"
Cohesion: 0.14
Nodes (17): construire_releve(), LigneReleve, Releve, texte_releve(), _debut_de(), envoyer(), pdf(), releve_de() (+9 more)

### Community 104 - "ventes/application"
Cohesion: 0.14
Nodes (14): annuler(), Depots, reprendre_veille(), Sacs, saisir(), _signaler_tardive(), _trace(), _verifier_droit() (+6 more)

### Community 105 - "specifications"
Cohesion: 0.15
Nodes (24): EP08 · Production, US-080 · Produits et fiches techniques, US-081 · Plan calculé depuis les commandes, US-082 · Validation du plan avec auto-validation à T-15 min, US-083 · Ouvrir, saisir le réalisé et clôturer la production, US-084 · Consommation réelle et justification des écarts, US-085 · Production non clôturée archivée et signalée, US-086 · Plan = commandes + demande estimée + supplément (+16 more)

### Community 106 - "stocks/infrastructure"
Cohesion: 0.12
Nodes (14): Ventilation, ventiler(), DernierComptage, _fin_de(), LigneADate, stock_du_soir(), LigneControle, Meta (+6 more)

### Community 107 - "ventes/application"
Cohesion: 0.11
Nodes (6): Catalogue, DepotCommandes, EtatCommande, _commandes(), DepotCommandesDjango, etat()

### Community 108 - "web/e2e/visuel/scenarios"
Cohesion: 0.24
Nodes (23): attendrePolices(), cliquer(), connecterLeCaissierDansLApplication(), connecterLeCaissierDansLePrototype(), coque, masquerLeBandeauDeSimulation(), scenariosCaissier, tiroir (+15 more)

### Community 109 - "paie/infrastructure"
Cohesion: 0.16
Nodes (9): LignePaieSerializer, Meta, LignePaie, Meta, deja_paye(), DepotPaiementsDjango, pdf_bulletin(), reste_de() (+1 more)

### Community 110 - "README.md"
Cohesion: 0.12
Nodes (13): Job api, Job changements (paths-filter), Workflow CI, Job pre-commit, Job web, Hook django-upgrade (cible 6.0), Hooks pre-commit du dépôt, Hooks Ruff (check et format) (+5 more)

### Community 111 - "clients/domain"
Cohesion: 0.18
Nodes (13): TypeClient, _entier(), LigneClient, LigneRejetee, lire_client(), lire_tarif(), importer(), _importer_clients() (+5 more)

### Community 112 - "notifications/api"
Cohesion: 0.11
Nodes (5): EnvoisViewSet, etat_des_envois(), EtatEnvoisSerializer, MessageSerializer, Meta

### Community 113 - "production/tests"
Cohesion: 0.14
Nodes (15): LignePlanProduction, Meta, SupplementProduction, Meta, _ajouter(), _bag(), farine(), seuil_30() (+7 more)

### Community 114 - "stocks/api"
Cohesion: 0.15
Nodes (6): LigneADateSerializer, LigneEtatSerializer, MouvementsStockViewSet, SaisieStockSerializer, StockADateRequeteSerializer, StockSerializer

### Community 115 - "stocks/tests"
Cohesion: 0.15
Nodes (17): marquer_controles_manques(), planifier_controles(), rappel_controle(), controle(), le_mercredi(), test_caissiere_refusee(), test_comptage_incomplet(), test_controle_manque_en_alerte() (+9 more)

### Community 116 - "ventes/api"
Cohesion: 0.12
Nodes (6): MouvementInterneSerializer, Meta, MouvementsInternesViewSet, NouveauMouvementSerializer, MouvementInterne, Meta

### Community 117 - "core/infrastructure"
Cohesion: 0.14
Nodes (10): test_format_fcfa(), test_le_pdf_est_envoye_au_gerant_suivant(), test_le_rapport_reprend_caisses_dettes_stock_et_incidents(), RapportPassation, Meta, _envoyer(), html(), _nom() (+2 more)

### Community 118 - "core/domain"
Cohesion: 0.16
Nodes (12): Passation, preparer(), Section, conflits_affectation(), precedente(), proposer_rotation(), semaine_de(), suivante() (+4 more)

### Community 119 - "core/application"
Cohesion: 0.22
Nodes (10): affecter(), _conflits(), copier_precedente(), DepotSemaines, EtatSemaine, obtenir_semaine(), planifier(), raisons_ouverture() (+2 more)

### Community 120 - "production/api"
Cohesion: 0.12
Nodes (4): CoutDeRevientSerializer, NouvelleFicheSerializer, ProduitsViewSet, _valeurs()

### Community 121 - "rapports/infrastructure"
Cohesion: 0.16
Nodes (12): Fournee, Meta, MoisSerializer, SemaineSerializer, SessionSerializer, en_excel(), en_pdf(), _lignes() (+4 more)

### Community 122 - "stocks/application"
Cohesion: 0.17
Nodes (10): _ajuster(), Autorisations, commencer(), conclure(), Depots, marquer_manques(), _ouvert_ce_jour(), planifier() (+2 more)

### Community 123 - "users"
Cohesion: 0.13
Nodes (8): accepter_invitation(), creer(), lien_invitation(), NouveauCompte, _appartenance(), changer_de_groupe(), creer_groupe(), modifier_groupe()

### Community 124 - "web"
Cohesion: 0.09
Nodes (20): description, engines, node, name, packageManager, private, sideEffects, type (+12 more)

### Community 125 - "web"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection, moduleResolution (+13 more)

### Community 126 - "core/infrastructure"
Cohesion: 0.12
Nodes (3): Bornes, DepotSemainesDjango, etat()

### Community 127 - "web/e2e/visuel/scenarios"
Cohesion: 0.13
Nodes (16): accordDuProprietairePrototype(), CONTENU, corrigerLesTextesDuPrototype(), echapper(), Etapes, livraisonDansLApplication(), livraisonDansLePrototype(), livrerAvecDette() (+8 more)

### Community 128 - "espaces/gestion/semaines"
Cohesion: 0.22
Nodes (17): cleSemaines(), codeErreur(), publier(), Reponse, useActionSemaines(), useAffecter(), useCloturerSemaine(), useOuvrirSemaine() (+9 more)

### Community 129 - "achats/tests"
Cohesion: 0.14
Nodes (9): _payer(), test_paiement_partiel_puis_solde(), test_reference_en_mobile_money(), test_seul_le_gerant_paie(), DepenseSerializer, Meta, Depense, Meta (+1 more)

### Community 130 - "users"
Cohesion: 0.14
Nodes (6): entree_de(), Entree, _poste_requis(), poser_cookie(), PosteConfianceMiddleware, tracer_echec()

### Community 131 - "paie/application"
Cohesion: 0.18
Nodes (8): _apres_paiement(), Depenses, DepotPaiements, Depots, payer(), _payer(), payer_tout(), _verifier()

### Community 132 - "simulation"
Cohesion: 0.18
Nodes (19): ReponseDecision, ressources, demandesDePlafond(), acteur(), decider(), deDepense(), deInventaire(), dejaDecidee() (+11 more)

### Community 133 - "espaces/gestion/semaines"
Cohesion: 0.12
Nodes (17): Ligne, Props, Props, Rubrique, AffectationJour, Controle, CreneauReel, Incident (+9 more)

### Community 134 - "specifications"
Cohesion: 0.16
Nodes (18): EP11 · Dépenses et budget, EP12 · Personnel et paie, US-110 · Saisir une dépense avec photo et rattachement, US-111 · Pré-autoriser les achats courants, US-112 · Dépenses au-dessus du seuil soumises, US-113 · Budget mensuel par catégorie, US-120 · Fiches employés et brouillon de paie pré-calculé, US-121 · Absences proposées depuis le planning (+10 more)

### Community 135 - "paie/tests"
Cohesion: 0.18
Nodes (14): PaiementSalaire, Meta, _detail(), _payer(), _payer_tout(), test_bulletin_pdf(), test_impaye_repris_le_mois_suivant(), test_paiement_partiel_cree_la_depense() (+6 more)

### Community 136 - "users/api"
Cohesion: 0.19
Nodes (4): ApercuSerializer, ChangementGroupeSerializer, CodeSerializer, UtilisateursViewSet

### Community 137 - "caisse/tests"
Cohesion: 0.22
Nodes (11): GenreMouvement, _auteur(), caisse(), _fermer(), _mouvements(), test_detail_des_especes(), test_la_fermeture_verrouille_les_saisies(), test_le_registre_est_en_ajout_seul() (+3 more)

### Community 138 - "clients/application"
Cohesion: 0.16
Nodes (4): Compte, Comptes, Sens, ComptesDjango

### Community 139 - "users/api"
Cohesion: 0.24
Nodes (5): BrouillonSerializer, Meta, BrouillonsViewSet, Brouillon, Meta

### Community 140 - "production/application"
Cohesion: 0.14
Nodes (3): Sources, Rendement, SourcesDjango

### Community 141 - "ventes/tests"
Cohesion: 0.19
Nodes (4): _a(), _saisir(), test_heure_limite_et_veille(), TestApi

### Community 142 - "web/e2e/visuel/scenarios"
Cohesion: 0.21
Nodes (15): applicationDemandes(), connecterApplication(), connecterPrototype(), CONTENU, decider(), demanderLePlafondApplication(), demanderLePlafondPrototype(), masquerLeBandeauDeSimulation() (+7 more)

### Community 143 - "web/e2e/visuel/scenarios"
Cohesion: 0.21
Nodes (14): bouton(), client(), cloture(), CONTENU, demandeAutorisation(), echapper(), Etapes, livraisonAvecDette() (+6 more)

### Community 144 - "simulation"
Cohesion: 0.23
Nodes (14): cloturerSemaine(), contexteSemaines(), Etat, etatInitial(), lireEtat(), marquerPlanifiee(), ouvrirSemaine(), planningDeDepart() (+6 more)

### Community 147 - "caisse/tests"
Cohesion: 0.20
Nodes (9): remise_proposee(), MouvementCaisse, Meta, caisse_pleine(), _remettre(), test_proposition_puis_remise_au_gerant(), test_refus(), test_remise_au_coffre() (+1 more)

### Community 148 - "users/api"
Cohesion: 0.22
Nodes (3): PosteSerializer, Meta, PostesViewSet

### Community 149 - "rapports/domain"
Cohesion: 0.23
Nodes (7): jour_de(), Tache, taches_de_la_semaine(), test_ecran_d_arrivee_selon_le_profil(), test_ma_caisse(), test_ma_semaine(), test_ma_semaine_datee()

### Community 150 - "web/e2e/visuel/scenarios"
Cohesion: 0.20
Nodes (12): Scenario, scenariosConnexion, champ(), choisir(), CONTENU, Etapes, Options, remplir() (+4 more)

### Community 151 - "specifications"
Cohesion: 0.23
Nodes (14): EP02 · Administration, US-020 · Créer un utilisateur en 3 étapes, US-021 · Créer des groupes et changer un utilisateur de groupe, US-024 · Journal des actions filtrable, Groupes d'utilisateurs (portent le profil de droits), Journal non modifiable (valeurs avant / après), Matrice des droits (§3.3), Module Administration (§5.12) (+6 more)

### Community 152 - "core/tests"
Cohesion: 0.28
Nodes (11): _action(), equipe(), _planifier(), test_changer_les_affectations(), test_copier_la_semaine_precedente(), test_le_profil_doit_correspondre_au_role(), test_le_proprietaire_planifie_une_semaine(), test_numero_de_semaine_impossible() (+3 more)

### Community 153 - "paie/tests"
Cohesion: 0.26
Nodes (9): ElementPaie, Meta, _ajouter(), _detail(), test_modifiables_en_brouillon_seulement(), test_modifier_puis_retirer(), test_motive_et_positif(), test_plusieurs_gains_et_penalites_dans_le_net() (+1 more)

### Community 154 - "stocks/domain"
Cohesion: 0.21
Nodes (6): a_soumettre(), date_du_jour(), ecart_pourcent(), portee_du_jour(), test_portee_et_date(), test_tolerance()

### Community 156 - "users/tests"
Cohesion: 0.28
Nodes (9): _client_google(), _connexion(), _google_repond(), mireille(), test_compte_desactive_refuse(), test_desactivee_sans_identifiant_client(), test_gmail_enregistre_puis_double_authentification(), test_gmail_non_enregistre_refuse() (+1 more)

### Community 157 - "web/e2e/visuel/scenarios"
Cohesion: 0.21
Nodes (10): definirScenario(), Jouer, applicationClients(), cliquerPuisAttendre(), CONTENU, masquerLeBandeauDeSimulation(), prototypeClients(), scenario() (+2 more)

### Community 158 - "paie/tests"
Cohesion: 0.24
Nodes (8): EmployeSerializer, Meta, Employe, Meta, ligne_mireille(), mireille(), paie(), paul()

### Community 159 - "rapports/api"
Cohesion: 0.21
Nodes (5): accueil(), AccueilSerializer, _administration(), _ma_caisse(), _tableau_de_bord()

### Community 160 - "rapports/api"
Cohesion: 0.42
Nodes (5): export_mois(), export_semaine(), export_session(), _fichier(), _valide()

### Community 161 - "stocks/api"
Cohesion: 0.18
Nodes (6): ControleStockSerializer, Meta, LigneControleSerializer, Meta, ControleStock, Meta

### Community 162 - "web/e2e/visuel"
Cohesion: 0.20
Nodes (9): definirScenario (scenarios/index.ts), outils.ts (cliquer, attendrePolices), Mode simulation de l'application (vite --mode simulation), Banc de contrôle visuel : prototype contre application (pnpm e2e:visuel), LANGUAGE_CODE fr, fuseau Africa/Douala, CI : un job par application (api, web), Livrables de design OptiBoul (export Claude Design), Prototype cliquable OptiBoul ERP v2 (.dc.html) (+1 more)

### Community 163 - "specifications"
Cohesion: 0.26
Nodes (11): EP07 · Demandes et notifications, US-070 · Émettre une demande liée à l'objet bloqué, US-071 · Accorder / refuser une demande à distance, US-072 · Escalade des demandes non traitées au propriétaire, US-073 · Notifications regroupées, US-074 · Centre de notifications avec compteur et routage par rôle, Centre de notifications avec compteur, Demande de validation DEM-xxx (+3 more)

### Community 164 - "specifications"
Cohesion: 0.33
Nodes (11): EP09 · Stocks et inventaires, US-090 · État du stock par matière, US-092 · Pertes, casse et corrections motivées, US-093 · Deux contrôles de stock guidés par semaine, US-094 · Stock à date, Contrôles de stock mercredi et dimanche, Inventaire et ajustement (tolérance 5 %), Module Stocks (§5.6) (+3 more)

### Community 166 - "caisse/infrastructure"
Cohesion: 0.25
Nodes (5): enregistrer(), incidents(), _reouverture(), section_caisses(), enregistrer_section()

### Community 167 - "core/infrastructure"
Cohesion: 0.22
Nodes (4): SequenceNumero, Meta, NumerosDjango, prochain_numero()

### Community 168 - "core/tests"
Cohesion: 0.38
Nodes (8): _placer(), s44(), test_copier_la_semaine_precedente_reprend_le_planning(), test_le_gerant_de_la_semaine_place_une_caissiere(), test_planning_vide_signale(), test_refus(), test_une_caissiere_par_creneau_et_conflit_signale(), _url()

### Community 170 - "rapports/api"
Cohesion: 0.20
Nodes (3): rapprochement(), RapprochementRequeteSerializer, RapprochementSerializer

### Community 172 - "specifications"
Cohesion: 0.33
Nodes (9): EP10 · Fournisseurs et réceptions, US-100 · Fournisseurs et planification des réceptions, US-101 · Réception en un clic depuis la réception planifiée, US-102 · Manquant relançable ou replanifiable, US-103 · Payer une facture et obtenir un reçu, Factures fournisseurs (farine à crédit, 19 525 FCFA le sac), Module Fournisseurs et réceptions (§5.7), R11 · Réception compte la quantité livrée ; manquant suivi (+1 more)

### Community 173 - "api"
Cohesion: 0.56
Nodes (9): docs service (Sphinx docs, port 9000), Local Docker Compose stack (optiboul), local celerybeat service, local celeryworker service, local django service (port 8000), local flower service, mailpit service, local postgres service (+1 more)

### Community 174 - "caisse/tests"
Cohesion: 0.36
Nodes (7): fermee(), _rouvrir(), test_le_gerant_rouvre_avec_un_motif(), test_motif_obligatoire(), test_ni_la_caissiere_ni_une_caisse_ouverte(), test_pas_de_reouverture_apres_la_cloture_de_la_semaine(), test_refermer_apres_reouverture()

### Community 176 - "core/api"
Cohesion: 0.31
Nodes (4): SemaineSerializer, Meta, Semaine, Meta

### Community 177 - "core/tests"
Cohesion: 0.36
Nodes (6): test_le_proprietaire_modifie_avec_historique_et_trace(), test_ni_le_gerant_ni_la_caisse_ne_consultent(), test_parametre_inconnu(), test_seul_le_proprietaire_modifie(), test_valeur_invalide_refusee(), _url()

### Community 178 - "depenses/tests"
Cohesion: 0.28
Nodes (5): part_du_budget(), _depenser(), test_budget_du_mois(), test_part_du_budget(), test_statut_du_budget()

### Community 184 - "simulation"
Cohesion: 0.36
Nodes (7): appeler(), cloturerLaSession(), depensesDeLaSession(), especesAttendues(), lire(), SAISIE, sessionApi()

### Community 187 - "core/infrastructure"
Cohesion: 0.33
Nodes (3): JournalDjango, _json(), _valeur()

### Community 190 - "web"
Cohesion: 0.29
Nodes (6): ignorePatterns, plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 193 - "adr"
Cohesion: 0.33
Nodes (4): ProfilGroupe (profil de droits porté par le groupe), apps/web/src/profils.ts (profil -> espaces et écran d'arrivée, O10), GET /api/v1/users/me/ (renvoie le profil), En-tête X-OptiBoul-Entree: distante

### Community 198 - "web"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Ambiguous Edges - Review These
- `OptiBoul ERP — Profils, parcours utilisateurs et UX (v3)` → `OptiBoul ERP — Cahier des charges v5`  [AMBIGUOUS]
  docs/specifications/OptiBoul_ERP_Parcours_utilisateurs_UX_v3.md · relation: conceptually_related_to
- `DoD: FR and EN texts` → `minimumReleaseAgeExclude (@tanstack, i18next, react-router)`  [AMBIGUOUS]
  apps/web/pnpm-workspace.yaml · relation: conceptually_related_to
- `Job web` → `Service traefik (production)`  [AMBIGUOUS]
  .github/workflows/ci.yml · relation: conceptually_related_to

## Knowledge Gaps
- **58 isolated node(s):** `jsdom`, `oxlint`, `prettier`, `@types/node`, `@types/react` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2330 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **116 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RefusMetier` connect `paie/application` to `API : caisses, manquants, sérialiseurs`, `achats/tests`, `Modèles de caisse et registres clients`, `paie/application`, `Relances clients et notifications`, `Tests fournisseurs et clôture forcée`, `API production : plans et consommations`, `caisse/tests`, `Dépenses, budget et autorisations`, `API clients : dettes et relevés`, `Contrôles de clôture de caisse`, `API encaissements`, `Domaine des demandes de validation`, `API manquants fournisseurs`, `Stocks : saisies et numérotation`, `API fournisseurs et factures`, `Clients habituels sans commande`, `Décision et escalade des demandes`, `Cas d'usage production`, `Calcul de la paie`, `Réponses d'argent idempotentes`, `API commandes et tarifs`, `Registre des comptes clients`, `rapports/api`, `Réceptions et factures fournisseurs`, `depenses/api`, `production/domain`, `production/application`, `demandes/api`, `core/api`, `caisse/application`, `production/application`, `core/application`, `caisse/api`, `achats/application`, `stocks/api`, `ventes/application`, `core/application`, `ventes/infrastructure`, `rapports/tests`, `ventes/domain`, `ventes/application`, `clients/domain`, `notifications/api`, `stocks/api`, `ventes/api`, `core/application`, `production/api`, `stocks/application`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 136 inferred relationships involving `Auteur` (e.g. with `_a_livrer()` and `relancer()`) actually correct?**
  _`Auteur` has 136 INFERRED edges - model-reasoned connections that need verification._
- **What connects `jsdom`, `oxlint`, `prettier` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API : caisses, manquants, sérialiseurs` be split into smaller, more focused modules?**
  _Cohesion score 0.03842955571394631 - nodes in this community are weakly interconnected._
- **Why does `Auteur` connect `Domaine des demandes de validation` to `API : caisses, manquants, sérialiseurs`, `Modèles de caisse et registres clients`, `Relances clients et notifications`, `paie/application`, `users`, `caisse/tests`, `Dépenses, budget et autorisations`, `Contrôles de clôture de caisse`, `API manquants fournisseurs`, `Stocks : saisies et numérotation`, `Clients habituels sans commande`, `Décision et escalade des demandes`, `Cas d'usage production`, `Calcul de la paie`, `Réceptions et factures fournisseurs`, `core/api`, `users`, `production/domain`, `production/application`, `core/api`, `users`, `caisse/application`, `production/application`, `core/application`, `achats/application`, `ventes/application`, `users`, `core/application`, `ventes/infrastructure`, `paie/application`, `users/domain`, `ventes/domain`, `clients/tests`, `ventes/application`, `clients/domain`, `core/application`, `stocks/application`, `users`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `OptiBoul ERP — Profils, parcours utilisateurs et UX (v3)` and `OptiBoul ERP — Cahier des charges v5`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `DoD: FR and EN texts` and `minimumReleaseAgeExclude (@tanstack, i18next, react-router)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._