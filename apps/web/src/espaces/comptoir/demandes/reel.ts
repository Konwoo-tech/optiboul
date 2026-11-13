import {
  demandesList,
  semainesList,
  toutesLesPages,
  type Demande as DemandeServeur,
  type Semaine,
} from '@/api';

import type { Profil } from '../../../profils.ts';
import type { Demande, ObjetLie, ReponseDemandes, TypeDemande } from './types.ts';

/*
 * Lecture de « Comptoir › Demandes » sur le vrai serveur : `GET /demandes/` (le serveur ne renvoie
 * à la caissière que les siennes) et la semaine ouverte pour nommer le gérant. Les cinq types du
 * serveur sont `plafond`, `depense`, `paie`, `inventaire` et `supplement` (la production de l'écran).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

const FUSEAU = 'Africa/Douala';
const jourDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(new Date(iso));
const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: FUSEAU }).format(
    new Date(iso),
  );

const TYPES: Record<string, TypeDemande> = {
  plafond: 'plafond',
  depense: 'depense',
  paie: 'paie',
  inventaire: 'inventaire',
  supplement: 'production',
};

type Details = Record<string, unknown>;

/** L'objet auquel la demande reste rattachée, d'après son type et ses détails. */
export function objetDeLaDemande(
  demande: DemandeServeur,
  semaineDe: (jour: string) => number,
): ObjetLie | null {
  const d = (demande.details ?? {}) as Details;
  switch (demande.type) {
    case 'plafond':
      return {
        genre: 'client',
        id: String(d.client ?? ''),
        nom: String(d.client_nom ?? ''),
        solde: Number(d.solde_apres ?? 0),
      };
    case 'depense':
      return {
        genre: 'depense',
        code: String(d.numero ?? ''),
        montant: Number(d.montant ?? 0),
        semaine: semaineDe(jourDeYaounde(demande.cree_le)),
      };
    case 'paie':
      return { genre: 'paie', mois: String(d.mois ?? '').slice(0, 7) };
    case 'inventaire':
      return { genre: 'inventaire', code: demande.objet };
    case 'supplement':
      return { genre: 'production' };
    default:
      return null;
  }
}

/** Une demande du serveur, telle que l'écran la lit ; `undefined` pour un type inconnu. */
export function versDemande(
  demande: DemandeServeur,
  semaineDe: (jour: string) => number,
): Demande | undefined {
  const type = TYPES[demande.type];
  if (!type) return undefined;
  const emise = {
    id: String(demande.id),
    numero: demande.numero,
    type,
    titre: demande.type_libelle,
    detail: demande.objet,
    par: ((demande.emetteur ?? {}) as { nom?: string }).nom ?? '',
    parProfil: demande.emetteur_profil as Profil,
    jour: jourDeYaounde(demande.cree_le),
    heure: heureDeYaounde(demande.cree_le),
    objet: objetDeLaDemande(demande, semaineDe),
  };
  if (demande.statut === 'accordee' || demande.statut === 'refusee') {
    return {
      ...emise,
      statut: demande.statut === 'accordee' ? 'acceptee' : 'refusee',
      decidePar: demande.decide_par_nom ?? '',
      decideA: demande.decide_le ? heureDeYaounde(demande.decide_le) : '',
    };
  }
  return { ...emise, statut: 'en-attente' };
}

/** Compose la réponse de l'écran à partir des demandes et de la semaine ouverte. */
export async function lireDemandesReelles(profilConnecte?: string, nomConnecte?: string) {
  const [demandes, semaines] = await Promise.all([
    toutesLesPages<DemandeServeur>(
      (page) => demandesList({ page }) as Promise<Page<DemandeServeur>>,
    ),
    toutesLesPages<Semaine>((page) => semainesList({ page }) as Promise<Page<Semaine>>).catch(
      () => [] as Semaine[],
    ),
  ]);
  const semaineDe = (jour: string) =>
    semaines.find((s) => s.du <= jour && jour <= s.au)?.numero ??
    semaines.find((s) => s.statut === 'ouverte')?.numero ??
    0;
  const ouverte = semaines.find((s) => s.statut === 'ouverte');
  const reponse: ReponseDemandes = {
    gerant: ouverte?.gerant?.nom ?? '',
    // Le serveur ne nomme pas le propriétaire : connu seulement quand c'est la personne connectée.
    proprietaire: profilConnecte === 'proprietaire' ? (nomConnecte ?? '') : '',
    demandes: demandes
      .map((d) => versDemande(d, semaineDe))
      .filter((d): d is Demande => d !== undefined)
      .sort((a, b) => b.numero - a.numero),
  };
  return reponse;
}
