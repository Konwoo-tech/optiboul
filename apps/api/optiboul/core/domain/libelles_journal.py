"""Libellés lisibles et familles des actions du journal (#361). Python pur.

Le journal garde le code de l'action (`caisse.ouverte`) ; l'écran affiche son libellé.
Un code inconnu reste lisible : libellé de sa famille, puis le reste du code.
"""

from __future__ import annotations

from enum import StrEnum


class Famille(StrEnum):
    CONNEXION = "connexion"
    CAISSE = "caisse"
    DEPENSE = "depense"
    DEMANDE = "demande"
    STOCK = "stock"
    FOURNISSEUR = "fournisseur"
    PRODUCTION = "production"
    SEMAINE = "semaine"
    PAIE = "paie"
    UTILISATEUR = "utilisateur"
    SAUVEGARDE = "sauvegarde"
    PARAMETRE = "parametre"
    AUTRE = "autre"


# Préfixe du code d'action → famille de l'écran Journal.
PREFIXES: dict[str, Famille] = {
    "connexion": Famille.CONNEXION,
    "mot_de_passe": Famille.CONNEXION,
    "mfa": Famille.CONNEXION,
    "poste": Famille.CONNEXION,
    "compte": Famille.CONNEXION,
    "caisse": Famille.CAISSE,
    "livraison": Famille.CAISSE,
    "encaissement": Famille.CAISSE,
    "commande": Famille.CAISSE,
    "commandes": Famille.CAISSE,
    "mouvement_interne": Famille.CAISSE,
    "client": Famille.CAISSE,
    "clients": Famille.CAISSE,
    "dettes": Famille.CAISSE,
    "depense": Famille.DEPENSE,
    "budget": Famille.DEPENSE,
    "pre_autorisations": Famille.DEPENSE,
    "demande": Famille.DEMANDE,
    "stock": Famille.STOCK,
    "inventaire": Famille.STOCK,
    "fournisseur": Famille.FOURNISSEUR,
    "reception": Famille.FOURNISSEUR,
    "facture": Famille.FOURNISSEUR,
    "manquant": Famille.FOURNISSEUR,
    "production": Famille.PRODUCTION,
    "plan": Famille.PRODUCTION,
    "supplement": Famille.PRODUCTION,
    "fiche": Famille.PRODUCTION,
    "produit": Famille.PRODUCTION,
    "semaine": Famille.SEMAINE,
    "planning": Famille.SEMAINE,
    "paie": Famille.PAIE,
    "employe": Famille.PAIE,
    "utilisateur": Famille.UTILISATEUR,
    "groupe": Famille.UTILISATEUR,
    "sauvegarde": Famille.SAUVEGARDE,
    "parametre": Famille.PARAMETRE,
    "notification": Famille.PARAMETRE,
}

FAMILLES: dict[Famille, tuple[str, str]] = {
    Famille.CONNEXION: ("Connexion", "Sign-in"),
    Famille.CAISSE: ("Caisse", "Till"),
    Famille.DEPENSE: ("Dépense", "Expense"),
    Famille.DEMANDE: ("Demande", "Request"),
    Famille.STOCK: ("Stock", "Stock"),
    Famille.FOURNISSEUR: ("Fournisseur", "Supplier"),
    Famille.PRODUCTION: ("Production", "Production"),
    Famille.SEMAINE: ("Semaine", "Week"),
    Famille.PAIE: ("Paie", "Payroll"),
    Famille.UTILISATEUR: ("Utilisateur", "User"),
    Famille.SAUVEGARDE: ("Sauvegarde", "Backup"),
    Famille.PARAMETRE: ("Paramètre", "Setting"),
    Famille.AUTRE: ("Autre", "Other"),
}

# Code d'action → (français, anglais).
ACTIONS: dict[str, tuple[str, str]] = {
    # Connexion et sécurité
    "connexion.reussie": ("Connexion réussie", "Signed in"),
    "connexion.echec": ("Échec de connexion", "Failed sign-in"),
    "connexion.fermee": ("Déconnexion", "Signed out"),
    "connexion.expiree": ("Déconnexion pour inactivité", "Signed out after inactivity"),
    "connexion.changement": ("Changement d'utilisateur", "User switched"),
    "connexion.verrouillage": ("Compte bloqué après des échecs", "Account locked"),
    "connexion.google_refusee": ("Connexion Google refusée", "Google sign-in refused"),
    "compte.debloque": ("Compte débloqué", "Account unlocked"),
    "mot_de_passe.demande": ("Mot de passe oublié", "Password reset requested"),
    "mot_de_passe.reinitialise": ("Mot de passe changé", "Password reset"),
    "mfa.totp_active": ("Application d'authentification activée", "Authenticator on"),
    "mfa.totp_desactive": (
        "Application d'authentification désactivée",
        "Authenticator off",
    ),
    "mfa.codes_secours_generes": (
        "Codes de secours renouvelés",
        "Backup codes renewed",
    ),
    "poste.enregistre": ("Poste de confiance enregistré", "Trusted device added"),
    "poste.revoque": ("Poste de confiance révoqué", "Trusted device revoked"),
    # Caisse, comptoir, clients
    "caisse.ouverte": ("Caisse ouverte", "Till opened"),
    "caisse.fermee": ("Caisse fermée", "Till closed"),
    "caisse.rouverte": ("Caisse rouverte", "Till reopened"),
    "caisse.remise": ("Remise d'espèces au coffre", "Cash handed over"),
    "caisse.hors_planning": ("Caisse ouverte hors planning", "Unplanned till opening"),
    "caisse.non_cloturee": ("Caisse archivée non clôturée", "Till archived open"),
    "livraison.enregistree": ("Livraison enregistrée", "Delivery recorded"),
    "livraison.bon_envoye": ("Bon de livraison envoyé", "Delivery note sent"),
    "encaissement.enregistre": ("Encaissement enregistré", "Payment received"),
    "commande.saisie": ("Commande saisie", "Order entered"),
    "commande.annulee": ("Commande annulée", "Order cancelled"),
    "commandes.reprises": ("Commandes habituelles reprises", "Usual orders copied"),
    "commandes.rappel_habituels": ("Rappel aux clients habituels", "Regulars reminded"),
    "mouvement_interne.enregistre": ("Mouvement interne", "Internal movement"),
    "client.cree": ("Client créé", "Customer created"),
    "client.modifie": ("Client modifié", "Customer updated"),
    "client.tarifs": ("Tarifs du client modifiés", "Customer prices updated"),
    "clients.import": ("Clients importés", "Customers imported"),
    "clients.relances": ("Relance des dettes", "Debt reminders sent"),
    "clients.releve_envoye": ("Relevé client envoyé", "Statement sent"),
    "dettes.reportees": ("Dettes reportées", "Debts carried over"),
    # Dépenses
    "depense.saisie": ("Dépense saisie", "Expense entered"),
    "depense.modifiee": ("Dépense modifiée", "Expense updated"),
    "depense.annulee": ("Dépense annulée", "Expense cancelled"),
    "budget.fixe": ("Budget du mois fixé", "Monthly budget set"),
    "pre_autorisations.fixees": (
        "Achats courants pré-autorisés",
        "Purchases pre-approved",
    ),
    # Demandes
    "demande.emise": ("Demande émise", "Request sent"),
    "demande.accordee": ("Demande accordée", "Request approved"),
    "demande.refusee": ("Demande refusée", "Request refused"),
    "demande.annulee": ("Demande annulée", "Request cancelled"),
    "demande.escaladee": ("Demande remontée au propriétaire", "Request escalated"),
    # Stocks
    "stock.perte": ("Perte de stock", "Stock loss"),
    "stock.correction": ("Correction de stock", "Stock correction"),
    "stock.inventaire": ("Ajustement d'inventaire", "Stock count adjustment"),
    "stock.achat": ("Achat rattaché au stock", "Stock purchase"),
    "stock.controle_fait": ("Contrôle de stock fait", "Stock check done"),
    # Fournisseurs
    "fournisseur.cree": ("Fournisseur créé", "Supplier created"),
    "fournisseur.modifie": ("Fournisseur modifié", "Supplier updated"),
    "reception.planifiee": ("Réception planifiée", "Delivery planned"),
    "reception.recue": ("Réception faite", "Delivery received"),
    "reception.annulee": ("Réception annulée", "Delivery cancelled"),
    "facture.payee": ("Facture payée", "Invoice paid"),
    "facture.paiement_partiel": ("Facture payée en partie", "Invoice partly paid"),
    "manquant.relance": ("Manquant relancé", "Shortfall chased"),
    "manquant.replanifie": ("Manquant replanifié", "Shortfall rescheduled"),
    # Production
    "plan.propose": ("Plan proposé", "Plan proposed"),
    "plan.valide": ("Plan validé", "Plan approved"),
    "plan.provisoire": ("Plan provisoire", "Provisional plan"),
    "production.ouverte": ("Production ouverte", "Production started"),
    "production.cloturee": ("Production clôturée", "Production closed"),
    "production.fournee": ("Fournée saisie", "Batch recorded"),
    "production.fournee_annulee": ("Fournée annulée", "Batch cancelled"),
    "production.consommation": ("Consommation saisie", "Consumption recorded"),
    "production.non_cloturee": (
        "Production archivée non clôturée",
        "Production archived open",
    ),
    "supplement.auto_accorde": ("Supplément accordé d'office", "Extra auto-approved"),
    "supplement.demande": ("Supplément demandé", "Extra requested"),
    "supplement.accorde": ("Supplément accordé", "Extra approved"),
    "supplement.refuse": ("Supplément refusé", "Extra refused"),
    "fiche.nouvelle_version": (
        "Nouvelle version de fiche technique",
        "New recipe version",
    ),
    "produit.cree": ("Produit créé", "Product created"),
    "produit.modifie": ("Produit modifié", "Product updated"),
    # Semaines
    "semaine.planifiee": ("Semaine planifiée", "Week planned"),
    "semaine.affectations": ("Affectations de la semaine", "Week assignments"),
    "semaine.ouverte": ("Semaine ouverte", "Week opened"),
    "semaine.cloturee": ("Semaine clôturée", "Week closed"),
    "semaine.cloturee_forcee": ("Semaine clôturée de force", "Week force-closed"),
    "semaine.passation": ("Rapport de passation édité", "Handover report issued"),
    "planning.creneau": ("Créneau du planning modifié", "Rota slot updated"),
    # Paie
    "paie.preparee": ("État de paie préparé", "Payroll prepared"),
    "paie.soumise": ("État de paie soumis", "Payroll submitted"),
    "paie.ligne_modifiee": ("Ligne de paie modifiée", "Payroll line updated"),
    "paie.gain_ajoute": ("Gain ajouté", "Bonus added"),
    "paie.penalite_ajoute": ("Pénalité ajoutée", "Penalty added"),
    "paie.element_modifie": ("Élément de paie modifié", "Payroll item updated"),
    "paie.element_retire": ("Élément de paie retiré", "Payroll item removed"),
    "paie.salaire_paye": ("Salaire payé", "Salary paid"),
    "paie.jour_modifie": ("Jour de paie modifié", "Payday changed"),
    "employe.cree": ("Employé créé", "Employee created"),
    "employe.modifie": ("Employé modifié", "Employee updated"),
    # Utilisateurs
    "utilisateur.cree": ("Compte créé", "Account created"),
    "utilisateur.modifie": ("Compte modifié", "Account updated"),
    "utilisateur.desactive": ("Compte désactivé", "Account deactivated"),
    "utilisateur.reactive": ("Compte réactivé", "Account reactivated"),
    "utilisateur.groupe_change": ("Changement de groupe", "Group changed"),
    "utilisateur.code_defini": ("Code du comptoir défini", "Till code set"),
    "utilisateur.code_reinitialise": (
        "Code du comptoir réinitialisé",
        "Till code reset",
    ),
    "utilisateur.invitation_acceptee": ("Invitation acceptée", "Invitation accepted"),
    "utilisateur.preferences": ("Préférences modifiées", "Preferences updated"),
    "groupe.cree": ("Groupe créé", "Group created"),
    "groupe.modifie": ("Groupe modifié", "Group updated"),
    "groupe.supprime": ("Groupe supprimé", "Group deleted"),
    # Sauvegardes
    "sauvegarde.demandee": ("Sauvegarde demandée", "Backup requested"),
    "sauvegarde.echec": ("Échec de sauvegarde", "Backup failed"),
    "sauvegarde.restauration_demandee": ("Restauration demandée", "Restore requested"),
    "sauvegarde.restauree": ("Base restaurée", "Database restored"),
    "sauvegarde.restauration_echec": ("Échec de restauration", "Restore failed"),
    # Paramètres
    "parametre.modifie": ("Paramètre modifié", "Setting changed"),
    "notification.regle_modifiee": (
        "Règle de notification modifiée",
        "Alert rule changed",
    ),
    # Autres
    "rapports.rapprochement": ("Rapprochement avec l'Excel", "Spreadsheet check"),
    "envoi.relance": ("Envoi relancé", "Message resent"),
}


def famille_de(action: str) -> Famille:
    return PREFIXES.get(action.split(".", 1)[0], Famille.AUTRE)


def prefixes_de(famille: Famille) -> list[str]:
    return [prefixe for prefixe, f in PREFIXES.items() if f is famille]


def libelle(action: str, langue: str = "fr") -> str:
    """Le libellé connu, sinon « Famille : reste du code », jamais le code brut."""
    rang = 1 if langue == "en" else 0
    if action in ACTIONS:
        return ACTIONS[action][rang]
    nom_famille = FAMILLES[famille_de(action)][rang]
    reste = action.split(".", 1)[-1].replace("_", " ")
    return f"{nom_famille} : {reste}"
