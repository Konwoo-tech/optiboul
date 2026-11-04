import { formaterMois } from '@/espaces/gestion/personnel/affichage.ts';
import { peutDecider, peutVoirToutes } from '@/espaces/comptoir/demandes/regles.ts';
import type {
  Demande,
  ReponseDecision,
  ReponseDemandes,
} from '@/espaces/comptoir/demandes/types.ts';
import { ressources } from '@/i18n';
import { formaterNombre } from '@/utils';

import { numeroDepense } from '@/espaces/comptoir/depenses/regles.ts';
import { demandesDePlafond, trancherDemandeDePlafond } from './comptoir.ts';
import { demandesDeDepense, trancherDemandeDeDepense, type Acteur } from './depenses.ts';
import { demandesDePaie, trancherDemandeDePaie } from './personnel.ts';
import { demandesDeProduction, trancherDemandeDeProduction } from './production.ts';
import { lireUtilisateurConnecte } from './session.ts';
import { demandesDInventaire, trancherDemandeDInventaire } from './stocks.ts';

/*
 * Faux serveur de « Comptoir › Demandes » (US-070, US-071) : la liste et les règles de la
 * maquette « OptiBoul ERP v2 » (fonctions decide, canDecide, vDemandes). Il ne garde aucune
 * demande : il les lit à leur source, les demandes de plafond dans la session
 * (`simulation/comptoir.ts`) et les demandes de dépense dans les dépenses
 * (`simulation/depenses.ts`), et leur décision est déléguée à cette source. La numérotation
 * DEM-xxx est commune (`numerosDemandes.ts`).
 */

const RACINE = '/api/v1/simulation/demandes/';

const probleme = (status: number, code: string, detail: string) =>
  Response.json({ detail, code }, { status });

type DemandeDePlafond = ReturnType<typeof demandesDePlafond>[number];
type DemandeDeDepense = ReturnType<typeof demandesDeDepense>[number];
type DemandeDInventaire = ReturnType<typeof demandesDInventaire>[number];
type DemandeDeProduction = ReturnType<typeof demandesDeProduction>[number];
type DemandeDePaie = ReturnType<typeof demandesDePaie>[number];

/** Demande de plafond de la session, au format commun ; une décision sans auteur ni heure est une erreur. */
function duPlafond(d: DemandeDePlafond): Demande {
  const commun = {
    id: d.id,
    numero: d.numero,
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

/** Demande de validation d'une dépense (Dépenses), au format commun. */
function deDepense({ demande, depense }: DemandeDeDepense): Demande {
  const categories: Record<string, string> = ressources.fr.translation.comptoir.depenses.categories;
  const commun = {
    id: demande.id,
    numero: demande.numero,
    type: 'depense',
    titre: `Dépense : ${depense.libelle}`,
    detail: [
      `${formaterNombre(depense.montant)} FCFA`,
      categories[depense.categorie] ?? depense.categorie,
      depense.photo ? 'justificatif joint' : 'sans justificatif',
    ].join(' · '),
    par: demande.par,
    parProfil: demande.parProfil,
    jour: depense.date,
    heure: demande.emiseA,
    objet: {
      genre: 'depense',
      code: numeroDepense(depense.numero),
      montant: depense.montant,
      semaine: Number(depense.semaine.slice(1)),
    },
  } as const;
  if (demande.statut === 'en-attente') return { ...commun, statut: 'en-attente' };
  if (!demande.decideePar || !demande.decideeA) {
    throw new Error(`Demande ${demande.id} décidée sans auteur ni heure.`);
  }
  return {
    ...commun,
    statut: demande.statut,
    decidePar: demande.decideePar,
    decideA: demande.decideeA,
  };
}

/** Demande de validation d'un inventaire dont l'écart dépasse 5 % (Stocks), au format commun. */
function deInventaire({ demande, inventaire }: DemandeDInventaire): Demande {
  const ecarts = inventaire.lignes
    .filter((l) => l.compte !== l.theorique)
    .map((l) => `${l.matiere} ${Math.round((l.compte - l.theorique) * 100) / 100}`)
    .join(' · ');
  const commun = {
    id: demande.id,
    numero: demande.numero,
    type: 'inventaire',
    titre: `Inventaire ${inventaire.id} : écarts au-delà de 5 %`,
    titreEn: `Stock count ${inventaire.id}: gaps above 5%`,
    detail: ecarts,
    par: demande.par,
    parProfil: demande.parProfil,
    jour: demande.jour,
    heure: demande.heure,
    objet: { genre: 'inventaire', code: inventaire.id },
  } as const;
  if (demande.statut === 'en-attente') return { ...commun, statut: 'en-attente' };
  if (!demande.decidePar || !demande.decideA) {
    throw new Error(`Demande ${demande.id} décidée sans auteur ni heure.`);
  }
  return {
    ...commun,
    statut: demande.statut,
    decidePar: demande.decidePar,
    decideA: demande.decideA,
  };
}

/** Demande d'augmentation de production (Atelier › Production), au format commun. */
function deProduction(d: DemandeDeProduction): Demande {
  const commun = {
    id: d.id,
    numero: d.numero,
    type: 'production',
    titre: `Augmentation de production : +${d.total} sac(s)`,
    titreEn: `Production increase: +${d.total} sack(s)`,
    detail: d.detail,
    detailEn: d.detailEn,
    par: d.par,
    parProfil: 'production',
    jour: d.jour,
    heure: d.heure,
    objet: { genre: 'production' },
  } as const;
  if (d.statut === 'en-attente') return { ...commun, statut: 'en-attente' };
  return { ...commun, statut: d.statut, decidePar: d.decidePar, decideA: d.decideA };
}

/** Demande de validation de l'état de paie (Gestion › Personnel), au format commun. */
function dePaie(d: DemandeDePaie): Demande {
  const commun = {
    id: d.id,
    numero: d.numero,
    type: 'paie',
    titre: `État de paie · ${formaterMois(d.mois, 'fr')}`,
    titreEn: `Payroll · ${formaterMois(d.mois, 'en')}`,
    detail: d.detail,
    detailEn: d.detailEn,
    par: d.par,
    parProfil: 'gerant',
    jour: d.jour,
    heure: d.heure,
    objet: { genre: 'paie', mois: d.mois },
  } as const;
  if (d.statut === 'en-attente') return { ...commun, statut: 'en-attente' };
  if (!d.decidePar || !d.decideA) {
    throw new Error(`Demande ${d.id} décidée sans auteur ni heure.`);
  }
  return { ...commun, statut: d.statut, decidePar: d.decidePar, decideA: d.decideA };
}

/** Toutes les demandes, plus récentes d'abord. */
function toutes(): Demande[] {
  return [
    ...demandesDePlafond().map(duPlafond),
    ...demandesDeDepense().map(deDepense),
    ...demandesDInventaire().map(deInventaire),
    ...demandesDeProduction().map(deProduction),
    ...demandesDePaie().map(dePaie),
  ].sort((x, y) => y.numero - x.numero);
}

/** Demandes qui attendent une décision, plus récentes d'abord (contrôles avant clôture d'une semaine). */
export function demandesEnAttente(): Demande[] {
  return toutes().filter((d) => d.statut === 'en-attente');
}

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

const dejaDecidee = () => probleme(409, 'deja_decidee', 'Cette demande a déjà reçu une réponse.');

function decider(a: Acteur, id: string, accord: boolean): Response {
  const demande = visibles(a).find((d) => d.id === id);
  if (!demande) return probleme(404, 'demande_inconnue', 'Demande inconnue.');
  if (!peutDecider(demande, a.profil)) {
    return probleme(403, 'droit_insuffisant', 'Votre profil ne peut pas décider cette demande.');
  }
  if (demande.statut !== 'en-attente') return dejaDecidee();
  if (demande.type === 'plafond') {
    if (!trancherDemandeDePlafond(id, accord, a.nom)) return dejaDecidee();
  } else if (demande.type === 'inventaire') {
    const resultat = trancherDemandeDInventaire(a, id, accord);
    if (resultat === 'interdit') {
      return probleme(403, 'droit_insuffisant', 'Votre profil ne peut pas décider cette demande.');
    }
    if (resultat !== 'ok') return dejaDecidee();
  } else if (demande.type === 'paie') {
    const resultat = trancherDemandeDePaie(a, id, accord);
    if (resultat === 'interdit') {
      return probleme(403, 'droit_insuffisant', 'Votre profil ne peut pas décider cette demande.');
    }
    if (resultat !== 'ok') return dejaDecidee();
  } else if (demande.type === 'production') {
    if (trancherDemandeDeProduction(a.nom, id, accord) !== 'ok') return dejaDecidee();
  } else {
    const resultat = trancherDemandeDeDepense(a, id, accord);
    if (resultat === 'interdit') {
      return probleme(403, 'droit_insuffisant', 'Votre profil ne peut pas décider cette demande.');
    }
    if (resultat !== 'ok') return dejaDecidee();
  }
  const reponse: ReponseDecision = { demande: toutes().find((d) => d.id === id)! };
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
