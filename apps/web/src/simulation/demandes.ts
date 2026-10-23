import { peutDecider, peutVoirToutes } from '@/espaces/comptoir/demandes/regles.ts';
import type {
  Demande,
  ReponseDecision,
  ReponseDemandes,
} from '@/espaces/comptoir/demandes/types.ts';
import { formaterHeure, formaterNombre } from '@/utils';

import type { Profil } from '../profils.ts';
import { demandesDePlafond, trancherDemandeDePlafond } from './comptoir.ts';
import { lireUtilisateurConnecte } from './session.ts';

/*
 * Faux serveur de « Comptoir › Demandes » (US-070, US-071) : la liste et les règles de la
 * maquette « OptiBoul ERP v2 » (fonctions decide, canDecide, vDemandes). Les demandes de plafond
 * viennent de la session en cours (`simulation/comptoir.ts`) ; la maquette n'en porte qu'une au
 * départ, la dépense de Willy. Tout vit en mémoire.
 */

const RACINE = '/api/v1/simulation/demandes/';

/** Numéro de la première demande : la maquette numérote à partir de DEM-021. */
const PREMIER_NUMERO = 21;

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

/** Fonction et non constante : aucun appel au chargement du module, donc rien dans le paquet de production. */
const demandesDeDepart = (): Demande[] => [
  {
    id: 'q1',
    numero: PREMIER_NUMERO,
    type: 'depense',
    titre: 'Dépense : Réparation du pétrin',
    titreEn: 'Expense: Kneader repair',
    detail: '65 000 FCFA · Technique · justificatif joint',
    par: 'Willy',
    parProfil: 'gerant',
    jour: '2026-10-13',
    heure: '16:40',
    statut: 'en-attente',
    objet: { genre: 'depense', code: 'DEP-0014', montant: 65000, semaine: 42 },
  },
];

type Journal = { heure: string; qui: string; quoi: string };

let departs: Demande[] | undefined;
let journal: Journal[] = [];
const lireDeparts = (): Demande[] => (departs ??= demandesDeDepart());

/** Remet les demandes à leur état de départ (tests). */
export function reinitialiserDemandes(): void {
  departs = undefined;
  journal = [];
}

/** Décisions tracées, plus récentes en premier (tests). */
export function journalDemandes(): readonly Journal[] {
  return journal;
}

function accorderOuRefuser(demande: Demande, accord: boolean, par: string): void {
  Object.assign(demande, {
    statut: accord ? 'acceptee' : 'refusee',
    decidePar: par,
    decideA: formaterHeure(new Date()),
  });
}

/** Demande de plafond de la session, au format commun ; une décision sans auteur ni heure est une erreur. */
function enDemande(d: ReturnType<typeof demandesDePlafond>[number], numero: number): Demande {
  const commun = {
    id: d.id,
    numero,
    type: 'plafond',
    titre: `Livraison au-delà du plafond : ${d.clientNom}`,
    titreEn: `Delivery over the limit: ${d.clientNom}`,
    detail: `${formaterNombre(d.soldeApres)} FCFA / ${formaterNombre(d.plafond)}`,
    par: d.par,
    parProfil: 'caissier',
    jour: d.jour,
    heure: d.heure,
    objet: { genre: 'client', id: d.clientId, nom: d.clientNom, solde: d.soldeClient },
  } as const;
  if (d.statut === 'en-attente') return { ...commun, statut: 'en-attente' };
  if (!d.decidePar || !d.decideA) {
    throw new Error(`Demande ${d.id} décidée sans auteur ni heure.`);
  }
  return { ...commun, statut: d.statut, decidePar: d.decidePar, decideA: d.decideA };
}

/** Toutes les demandes, plus récentes d'abord : la maquette de départ, puis celles de la session. */
function toutes(): Demande[] {
  const base = lireDeparts();
  const plafonds = [...demandesDePlafond()].reverse();
  const duPlafond = plafonds.map((d, rang) => enDemande(d, PREMIER_NUMERO + base.length + rang));
  return [...duPlafond, ...base].sort((x, y) => y.numero - x.numero);
}

type Acteur = { nom: string; profil: Profil };

function acteur(): Acteur | undefined {
  const utilisateur = lireUtilisateurConnecte();
  if (!utilisateur) return undefined;
  const { profil, nom } = utilisateur;
  return profil === 'caissier' || profil === 'gerant' || profil === 'proprietaire'
    ? { nom, profil }
    : undefined;
}

function visibles(a: Acteur): Demande[] {
  return toutes().filter((d) => peutVoirToutes(a.profil) || d.par === a.nom);
}

function decider(a: Acteur, id: string, accord: boolean): Response {
  const demande = visibles(a).find((d) => d.id === id);
  if (!demande) return probleme(404, 'demande_inconnue', 'Demande inconnue.');
  if (!peutDecider(demande, a.profil)) {
    return probleme(403, 'droit_insuffisant', 'Votre profil ne peut pas décider cette demande.');
  }
  if (demande.statut !== 'en-attente') {
    return probleme(409, 'deja_decidee', 'Cette demande a déjà reçu une réponse.');
  }
  if (demande.type === 'plafond') {
    if (!trancherDemandeDePlafond(id, accord, a.nom)) {
      return probleme(409, 'deja_decidee', 'Cette demande a déjà reçu une réponse.');
    }
  } else {
    accorderOuRefuser(
      lireDeparts().find((d) => d.id === id)!,
      accord,
      a.nom,
    );
  }
  journal = [
    {
      heure: formaterHeure(new Date()),
      qui: a.nom,
      quoi: `${accord ? 'Accord' : 'Refus'} – ${demande.titre}`,
    },
    ...journal,
  ];
  const decidee = toutes().find((d) => d.id === id)!;
  const reponse: ReponseDecision = { demande: decidee };
  return Response.json(reponse);
}

/**
 * Routes simulées des demandes ; `null` quand l'appel n'est pas pour elles.
 * - GET  /api/v1/simulation/demandes/                    liste (la caissière ne reçoit que les siennes)
 * - POST /api/v1/simulation/demandes/<id>/decider/       { accord } : gérant et propriétaire, selon la demande
 */
export function repondreDemandes(methode: string, chemin: string, corps: Record<string, unknown>) {
  if (!chemin.startsWith(RACINE)) return null;
  if (!lireUtilisateurConnecte()) return probleme(403, 'non_authentifie', 'Connexion requise.');
  const a = acteur();
  if (!a) return probleme(403, 'droit_insuffisant', 'Votre profil ne voit pas les demandes.');
  const reste = chemin.slice(RACINE.length);

  if (methode === 'GET' && reste === '') {
    const reponse: ReponseDemandes = {
      gerant: 'Willy',
      proprietaire: 'M. Fotso',
      demandes: visibles(a),
    };
    return Response.json(reponse);
  }

  const decision = /^([^/]+)\/decider\/$/.exec(reste);
  if (methode === 'POST' && decision) {
    if (typeof corps.accord !== 'boolean') {
      return probleme(400, 'decision_invalide', 'Indiquez si la demande est accordée ou refusée.');
    }
    return decider(a, decision[1]!, corps.accord);
  }

  return null;
}
