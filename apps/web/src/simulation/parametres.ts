import {
  formaterValeur,
  memeValeur,
  messageDeLErreur,
  peutConsulterParametres,
  peutModifierParametres,
  validerValeur,
} from '@/espaces/gestion/parametres/regles.ts';
import type {
  Genre,
  Parametre,
  ValeurParametre,
  ValeurPassee,
} from '@/espaces/gestion/parametres/types.ts';

import { consigner } from './journal.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur de « Gestion › Paramètres » (US-023, cahier des charges §9) et SOURCE UNIQUE des
 * paramètres métier de la simulation : plafond de dette, seuil de validation des dépenses,
 * tolérances, horaires… Les autres faux serveurs lisent leur valeur ici par `valeurDuParametre`,
 * au lieu de garder une constante en dur. Le catalogue, les défauts et les contrôles reproduisent
 * ceux de l'API (`core/domain/parametres.py`) ; les valeurs vivent en mémoire.
 *
 * Droits : le propriétaire modifie, l'administrateur consulte, les autres profils n'ont aucun accès.
 * Un changement est tracé UNE fois au journal (`consigner`, avec avant / après) ; une valeur
 * inchangée n'est ni enregistrée ni tracée. L'historique ne garde que les valeurs enregistrées.
 */

type Corps = Record<string, unknown>;

const RACINE = '/api/v1/simulation/gestion/parametres/';

const probleme = (status: number, code: string, detail: string, autres: object = {}) =>
  Response.json({ detail, code, ...autres }, { status });

type Definition = {
  cle: string;
  libelle: string;
  genre: Genre;
  defaut: ValeurParametre;
  unite?: string;
  usage?: string;
  minimum?: number;
  maximum?: number;
  choix?: number[];
};

const montant = (cle: string, libelle: string, defaut: number, usage: string): Definition => ({
  cle,
  libelle,
  genre: 'montant',
  defaut,
  unite: 'FCFA',
  usage,
});

const CATALOGUE: readonly Definition[] = [
  montant('plafond_dette_client', 'Plafond de dette par client', 2_000, 'R6, livraisons'),
  {
    cle: 'echeance_dettes',
    libelle: 'Échéance des dettes',
    genre: 'jour',
    defaut: 'dimanche',
    usage: 'R6, relances',
  },
  {
    cle: 'relances_jours',
    libelle: 'Jours des relances automatiques',
    genre: 'jours',
    defaut: ['jeudi', 'samedi'],
    usage: 'O11',
  },
  {
    cle: 'relances_heure',
    libelle: 'Heure des relances automatiques',
    genre: 'heure',
    defaut: '10:00',
    usage: 'O11',
  },
  montant('fonds_caisse', 'Fonds de caisse', 20_000, 'Ouverture de caisse'),
  montant('plafond_especes', "Plafond d'espèces en caisse", 100_000, 'R18'),
  montant('seuil_validation_depenses', 'Seuil de validation des dépenses', 50_000, 'R8'),
  {
    cle: 'seuil_budget_surveiller',
    libelle: 'Seuil « à surveiller » du budget',
    genre: 'pourcentage',
    defaut: 80,
    unite: '%',
    usage: 'Budget',
  },
  {
    cle: 'ecart_matiere_kg_par_sac',
    libelle: 'Écart matière toléré par sac',
    genre: 'entier',
    defaut: 2,
    unite: 'kg',
    usage: 'R10',
  },
  {
    cle: 'ecart_matiere_grammes',
    libelle: 'Écart matière toléré pour les intrants en grammes',
    genre: 'pourcentage',
    defaut: 4,
    unite: '%',
    usage: 'R10',
  },
  {
    cle: 'tolerance_inventaire',
    libelle: "Tolérance d'inventaire",
    genre: 'pourcentage',
    defaut: 5,
    unite: '%',
    usage: 'R9',
  },
  {
    cle: 'tolerance_validation_plan',
    libelle: 'Tolérance de validation automatique du plan',
    genre: 'pourcentage',
    defaut: 10,
    unite: '% de la moyenne des 4 dernières sessions',
    usage: 'R4',
  },
  {
    cle: 'heure_limite_commandes_nuit',
    libelle: 'Heure limite des commandes (nuit)',
    genre: 'heure',
    defaut: '18:30',
    usage: 'Production',
  },
  {
    cle: 'heure_limite_commandes_jour',
    libelle: 'Heure limite des commandes (jour)',
    genre: 'heure',
    defaut: '05:30',
    usage: 'Production',
  },
  {
    cle: 'heure_petrissage_nuit',
    libelle: 'Heure du pétrissage (nuit)',
    genre: 'heure',
    defaut: '19:00',
    usage: 'Production, validation automatique du plan à T-15 min (O6)',
  },
  {
    cle: 'heure_petrissage_jour',
    libelle: 'Heure du pétrissage (jour)',
    genre: 'heure',
    defaut: '06:30',
    usage: 'Production, validation automatique du plan à T-15 min (O6)',
  },
  {
    cle: 'echeance_demande_plafond',
    libelle: "Échéance d'une demande de plafond",
    genre: 'entier',
    defaut: 10,
    unite: 'minutes',
    usage: 'R19',
    minimum: 1,
  },
  {
    cle: 'inactivite_comptoir',
    libelle: 'Inactivité avant déconnexion au comptoir',
    genre: 'choix',
    defaut: 5,
    unite: 'minutes',
    usage: 'Sécurité',
    choix: [1, 5, 10, 15],
  },
  {
    cle: 'sauvegarde_locale',
    libelle: 'Intervalle de la sauvegarde locale',
    genre: 'entier',
    defaut: 4,
    unite: 'heures (et à chaque clôture)',
    usage: 'Administration',
    minimum: 1,
    maximum: 24,
  },
  {
    cle: 'alerte_sauvegarde_cloud',
    libelle: 'Alerte sans copie cloud',
    genre: 'entier',
    defaut: 48,
    unite: 'heures',
    usage: 'Administration',
    minimum: 1,
  },
  montant('prix_sac_farine', 'Prix du sac de farine', 19_525, 'Factures, coûts'),
  {
    cle: 'demande_estimee_sessions',
    libelle: 'Demande estimée : sessions du même type',
    genre: 'entier',
    defaut: 4,
    unite: 'sessions',
    usage: 'Plan de production',
    minimum: 1,
  },
  {
    cle: 'supplement_auto_sacs',
    libelle: 'Supplément accordé automatiquement (sacs par produit)',
    genre: 'entier',
    defaut: 1,
    unite: 'sac',
    usage: 'O17, R15',
  },
  {
    cle: 'supplement_auto_pourcentage',
    libelle: 'Supplément accordé automatiquement (part du plan)',
    genre: 'pourcentage',
    defaut: 10,
    unite: '%',
    usage: 'O17, R15',
  },
  {
    cle: 'rappel_clients_habituels',
    libelle: "Rappel aux clients habituels avant l'heure limite",
    genre: 'entier',
    defaut: 30,
    unite: 'minutes',
    usage: 'O18',
  },
  {
    cle: 'jour_de_paie',
    libelle: 'Jour de paie du mois',
    genre: 'entier',
    defaut: 28,
    unite: 'jour',
    usage: 'Paie',
    minimum: 1,
    maximum: 28,
  },
  {
    cle: 'stock_sessions_bas',
    libelle: 'Stock bas : sessions restantes',
    genre: 'entier',
    defaut: 2,
    unite: 'sessions',
    usage: 'État du stock',
  },
  {
    cle: 'stock_sessions_commande',
    libelle: 'À commander : sessions restantes',
    genre: 'entier',
    defaut: 6,
    unite: 'sessions',
    usage: 'État du stock',
  },
  {
    cle: 'controles_stock_jours',
    libelle: 'Jours des contrôles de stock',
    genre: 'jours',
    defaut: ['mercredi', 'dimanche'],
    usage: 'R16',
  },
];

/** Valeurs enregistrées par clé, de la plus récente à la plus ancienne. */
let historique = new Map<string, ValeurPassee[]>();

/** Remet les valeurs par défaut (tests). */
export function reinitialiserParametres(): void {
  historique = new Map();
}

const definition = (cle: string) => CATALOGUE.find((d) => d.cle === cle);

const copie = <T extends ValeurParametre>(valeur: T): T =>
  (Array.isArray(valeur) ? [...valeur] : valeur) as T;

/**
 * Valeur en vigueur d'un paramètre : celle que le propriétaire a enregistrée, sinon le défaut.
 * Pour les autres faux serveurs, qui ne gardent plus de constante en dur.
 */
export function valeurDuParametre<T extends ValeurParametre = number>(cle: string): T {
  const d = definition(cle);
  if (!d) throw new Error(`Paramètre inconnu : ${cle}`);
  return copie((historique.get(cle)?.[0]?.valeur ?? d.defaut) as T);
}

/** Défaut du catalogue (tests de cohérence avec les règles des écrans). */
export const defautDuParametre = (cle: string): ValeurParametre | undefined => {
  const d = definition(cle);
  return d && copie(d.defaut);
};

function projeter(d: Definition): Parametre {
  const derniere = historique.get(d.cle)?.[0];
  return {
    cle: d.cle,
    libelle: d.libelle,
    genre: d.genre,
    unite: d.unite ?? '',
    usage: d.usage ?? '',
    valeur: copie(derniere?.valeur ?? d.defaut),
    defaut: copie(d.defaut),
    choix: [...(d.choix ?? [])],
    minimum: d.minimum ?? null,
    maximum: d.maximum ?? null,
    modifie_le: derniere?.le ?? null,
    modifie_par: derniere?.auteur ?? '',
  };
}

function modifier(cle: string, corps: Corps): Response {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!peutModifierParametres(utilisateur.profil)) {
    return probleme(403, 'droit_insuffisant', 'Seul le propriétaire modifie les paramètres.');
  }
  const d = definition(cle);
  if (!d) return probleme(404, 'parametre_inconnu', 'Paramètre inconnu.');
  const modele = projeter(d);
  const verdict = validerValeur(modele, corps.valeur);
  if (!verdict.ok) {
    const message = messageDeLErreur(verdict.erreur);
    return probleme(400, 'valeur_invalide', message, { valeur: message, erreur: verdict.erreur });
  }
  if (!memeValeur(verdict.valeur, modele.valeur)) {
    historique.set(cle, [
      { valeur: copie(verdict.valeur), auteur: utilisateur.nom, le: new Date().toISOString() },
      ...(historique.get(cle) ?? []),
    ]);
    consigner({
      auteur: utilisateur.nom,
      type: 'parametre',
      texte: `Paramètre modifié : ${d.libelle}`,
      avant: formaterValeur(modele, modele.valeur),
      apres: formaterValeur(modele, verdict.valeur),
    });
  }
  return Response.json(projeter(d));
}

/** Lectures (liste, historique) : propriétaire et administrateur. */
function consulter(cle: string | undefined, historiqueDemande: boolean): Response {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
  if (!peutConsulterParametres(utilisateur.profil)) {
    return probleme(403, 'droit_insuffisant', 'Votre profil ne consulte pas les paramètres.');
  }
  if (cle === undefined) return Response.json(CATALOGUE.map(projeter));
  if (!definition(cle) || !historiqueDemande) {
    return probleme(404, 'parametre_inconnu', 'Paramètre inconnu.');
  }
  return Response.json((historique.get(cle) ?? []).map((v) => ({ ...v, valeur: copie(v.valeur) })));
}

const nonPermise = () => probleme(405, 'methode_refusee', 'Méthode non permise.');

/**
 * Routes simulées de « Gestion › Paramètres » ; `undefined` quand l'appel n'est pas pour elles.
 * - GET /api/v1/simulation/gestion/parametres/                  propriétaire, administrateur
 * - PUT /api/v1/simulation/gestion/parametres/{cle}/            propriétaire seul, corps `{ valeur }`
 * - GET /api/v1/simulation/gestion/parametres/{cle}/historique/ propriétaire, administrateur
 */
export function repondreParametres(url: URL, methode: string, corps: Corps): Response | undefined {
  if (!url.pathname.startsWith(RACINE)) return undefined;
  const reste = url.pathname.slice(RACINE.length);
  if (reste === '') return methode === 'GET' ? consulter(undefined, false) : nonPermise();
  const trouve = /^([a-z_]+)\/(historique\/)?$/.exec(reste);
  if (!trouve) return probleme(404, 'parametre_inconnu', 'Paramètre inconnu.');
  const [, cle = '', historiqueDemande] = trouve;
  if (historiqueDemande) return methode === 'GET' ? consulter(cle, true) : nonPermise();
  return methode === 'PUT' ? modifier(cle, corps) : nonPermise();
}
