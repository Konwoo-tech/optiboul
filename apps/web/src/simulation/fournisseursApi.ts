import type { ModeDepense } from '@/espaces/comptoir/depenses/types.ts';
import {
  droitsFournisseurs,
  joursPlanifiables,
  manque,
  quantiteTropGrande,
  quantiteValide,
} from '@/espaces/gestion/fournisseurs/regles.ts';
import {
  MATIERES,
  MODES_PAIEMENT,
  type InstantaneFournisseurs,
  type ModePaiement,
} from '@/espaces/gestion/fournisseurs/types.ts';
import type { Profil } from '../profils.ts';

import { enregistrerPaiementFournisseur } from './depenses.ts';
import {
  aujourdhuiFournisseurs,
  commandesSimulees,
  facturesSimulees,
  fournisseurSimule,
  fournisseursSimules,
  lierDepense,
  payerFacture,
  planifierBon,
  receptionnerBon,
  replanifierReliquat,
  tracerFournisseurs,
} from './fournisseurs.ts';
import { lireUtilisateurConnecte } from './session.ts';
import { entrerEnStockDepuisReception, prixDesMatieres } from './stocks.ts';

/*
 * Faux serveur de « Gestion › Fournisseurs » (US-173, récits US-100 à US-103) : les règles de la
 * maquette « OptiBoul ERP v2 » (fonction `vFournisseurs`). Les données vivent dans
 * `fournisseurs.ts` ; la réception passe par les fonctions de `stocks.ts` (entrée de stock) et le
 * paiement par celles de `depenses.ts` (dépense rattachée au stock).
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/gestion/fournisseurs/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });
const LONGUEUR_REFERENCE = 60;
const refus = () => probleme(403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.');

const MODE_DEPENSE: Record<ModePaiement, ModeDepense> = {
  especes: 'caisse',
  banque: 'banque',
  mobile: 'mobile',
};

function instantane(): InstantaneFournisseurs {
  const aujourdhui = aujourdhuiFournisseurs();
  return {
    aujourdhui,
    jours: joursPlanifiables(aujourdhui),
    fournisseurs: fournisseursSimules(),
    commandes: commandesSimulees(),
    factures: facturesSimulees(),
  };
}

type Acteur = { nom: string; profil: Profil };

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur || !droitsFournisseurs(utilisateur.profil).voir) return undefined;
  return { nom: utilisateur.nom, profil: utilisateur.profil };
}

const texte = (valeur: unknown) => (typeof valeur === 'string' ? valeur : '');

function planifier(a: Acteur, corps: Corps): Response {
  const fournisseur = fournisseurSimule(texte(corps.fournisseur));
  if (!fournisseur) return probleme(404, 'fournisseur_inconnu', 'Fournisseur inconnu.');
  const matiere = MATIERES.find((m) => m === corps.matiere);
  if (!matiere || !fournisseur.matieres.includes(matiere)) {
    return probleme(400, 'matiere_invalide', 'Ce fournisseur ne vend pas cette matière.');
  }
  if (typeof corps.quantite !== 'number' || !quantiteValide(corps.quantite)) {
    return probleme(400, 'quantite_obligatoire', 'Indiquez une quantité.');
  }
  if (quantiteTropGrande(corps.quantite)) {
    return probleme(400, 'quantite_trop_grande', 'Quantité trop élevée.');
  }
  const jour = texte(corps.jour);
  if (!joursPlanifiables(aujourdhuiFournisseurs()).includes(jour)) {
    return probleme(400, 'jour_invalide', 'Choisissez un jour dans les huit prochains jours.');
  }
  const bon = planifierBon({
    fournisseur: fournisseur.id,
    matiere,
    quantite: corps.quantite,
    jour,
    par: a.nom,
  });
  tracerFournisseurs(
    a.nom,
    `Réception planifiée ${bon.numero} : ${bon.commandee} ${matiere} · ${fournisseur.nom} · ${jour}`,
  );
  return Response.json({ instantane: instantane(), commande: bon });
}

function receptionner(a: Acteur, corps: Corps): Response {
  const numero = texte(corps.commande);
  const bon = commandesSimulees().find((c) => c.numero === numero);
  if (!bon) return probleme(404, 'commande_inconnue', 'Bon de commande inconnu.');
  if (bon.statut !== 'planifiee') {
    return probleme(409, 'commande_deja_recue', 'Ce bon de commande a déjà été réceptionné.');
  }
  if (typeof corps.quantite !== 'number' || !quantiteValide(corps.quantite)) {
    return probleme(400, 'quantite_obligatoire', 'Indiquez la quantité reçue.');
  }
  if (quantiteTropGrande(corps.quantite)) {
    return probleme(400, 'quantite_trop_grande', 'Quantité trop élevée.');
  }
  const observation = texte(corps.observation).trim();
  const resultat = receptionnerBon(numero, corps.quantite, prixDesMatieres()[bon.matiere], a.nom)!;
  const fournisseur = fournisseurSimule(bon.fournisseur)!;
  const partielle = resultat.commande.statut === 'partielle';
  entrerEnStockDepuisReception({
    matiere: bon.matiere,
    quantite: resultat.quantite,
    code: bon.numero,
    fournisseur: fournisseur.nom,
    partielle,
    par: a.nom,
  });
  tracerFournisseurs(
    a.nom,
    `Réception ${bon.numero} · ${fournisseur.nom} · ${resultat.quantite} ${bon.matiere}${
      partielle ? ` (manque ${manque(resultat.commande)})` : ''
    }${observation ? ` · ${observation}` : ''}`,
  );
  return Response.json({
    instantane: instantane(),
    commande: resultat.commande,
    facture: resultat.facture,
  });
}

function relancer(a: Acteur, corps: Corps): Response {
  const bon = commandesSimulees().find((c) => c.numero === texte(corps.commande));
  if (!bon) return probleme(404, 'commande_inconnue', 'Bon de commande inconnu.');
  if (bon.statut !== 'partielle') {
    return probleme(409, 'aucun_manquant', 'Ce bon de commande n’a pas de manquant à relancer.');
  }
  const fournisseur = fournisseurSimule(bon.fournisseur)!;
  tracerFournisseurs(
    a.nom,
    `Relance fournisseur ${fournisseur.nom} : manquant ${manque(bon)} ${bon.matiere} (${bon.numero})`,
  );
  return Response.json({ instantane: instantane(), commande: bon });
}

function replanifier(a: Acteur, corps: Corps): Response {
  const numero = texte(corps.commande);
  if (!commandesSimulees().some((c) => c.numero === numero)) {
    return probleme(404, 'commande_inconnue', 'Bon de commande inconnu.');
  }
  const resultat = replanifierReliquat(numero, a.nom);
  if (!resultat) {
    return probleme(409, 'aucun_manquant', 'Ce bon de commande n’a pas de manquant à replanifier.');
  }
  tracerFournisseurs(
    a.nom,
    `Reliquat replanifié : ${resultat.reliquat.numero} · ${resultat.reliquat.commandee} ${resultat.reliquat.matiere}`,
  );
  return Response.json({
    instantane: instantane(),
    commande: resultat.origine,
    reliquat: resultat.reliquat,
  });
}

function payer(a: Acteur, corps: Corps): Response {
  const numero = texte(corps.facture);
  const facture = facturesSimulees().find((f) => f.numero === numero);
  if (!facture) return probleme(404, 'facture_inconnue', 'Facture inconnue.');
  const mode = MODES_PAIEMENT.find((m) => m === corps.mode);
  if (!mode) return probleme(400, 'mode_inconnu', 'Mode de paiement inconnu.');
  const reference = texte(corps.reference).trim();
  // R7 : un paiement par mobile money porte la référence de la transaction.
  if (mode === 'mobile' && !reference) {
    return probleme(400, 'reference_obligatoire', 'Référence obligatoire pour le mobile money.');
  }
  if (reference.length > LONGUEUR_REFERENCE) {
    return probleme(400, 'reference_invalide', 'Référence trop longue.');
  }
  const paiement = payerFacture(numero, mode, mode === 'mobile' ? reference : '');
  if (paiement.resultat !== 'ok') {
    return probleme(409, 'facture_non_payable', 'Cette facture ne peut pas être payée.');
  }
  const depense = enregistrerPaiementFournisseur({
    facture: numero,
    fournisseur: fournisseurSimule(facture.fournisseur)!.nom,
    montant: facture.montant,
    mode: MODE_DEPENSE[mode],
    par: a.nom,
    parProfil: a.profil,
  });
  lierDepense(numero, depense);
  tracerFournisseurs(
    a.nom,
    `Paiement fournisseur ${numero} · ${facture.montant} FCFA (${mode}) · ${depense}`,
  );
  const payee = facturesSimulees().find((f) => f.numero === numero);
  return Response.json({ instantane: instantane(), facture: payee, depense });
}

/**
 * Réponses de « Gestion › Fournisseurs ». Renvoie `undefined` pour une route qui n'est pas la
 * sienne : le routeur général répond alors « pas encore simulé ». Le gérant planifie, réceptionne
 * et paie ; le propriétaire consulte (cahier des charges §3.3).
 */
export function repondreFournisseurs(
  url: URL,
  methode: string,
  corps: Corps,
): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const appel = `${methode} ${url.pathname.slice(RACINE.length)}`;

  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a) return refus();

  if (appel === 'GET ') return Response.json(instantane());
  const actions: Record<string, (a: Acteur, corps: Corps) => Response> = {
    'POST commandes/': planifier,
    'POST receptions/': receptionner,
    'POST relances/': relancer,
    'POST reliquats/': replanifier,
    'POST paiements/': payer,
  };
  const action = actions[appel];
  if (!action) return undefined;
  if (!droitsFournisseurs(a.profil).modifier) return refus();
  return action(a, corps);
}
