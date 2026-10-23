import type { Profil } from '../../../profils.ts';
import type { Demande, ObjetLie } from './types.ts';

/** Nombre de décisions récentes affichées (maquette : `slice(0, 12)`). */
export const DECISIONS_AFFICHEES = 12;

type Qui = Pick<Demande, 'type' | 'parProfil'>;

/**
 * Qui valide une demande (cahier des charges §5.9) :
 * - plafond et augmentation de production : le gérant de la semaine ou le propriétaire ;
 * - dépense : le gérant si elle vient d'une caissière, sinon le propriétaire ;
 *   (le propriétaire peut toujours décider à la place du gérant : le libellé le dit) ;
 * - état de paie et inventaire avec écart : le propriétaire.
 */
export type Validateur = 'gerant-ou-proprietaire' | 'gerant' | 'proprietaire';

export function validateurDe({ type, parProfil }: Qui): Validateur {
  if (type === 'plafond' || type === 'production') return 'gerant-ou-proprietaire';
  if (type === 'depense' && parProfil === 'caissier') return 'gerant';
  return 'proprietaire';
}

/**
 * Le profil peut accorder ou refuser cette demande (matrice des droits §3.3). Le propriétaire
 * décide de tout ; le gérant, de ce qui ne revient pas au propriétaire seul (jamais de ses
 * propres dépenses). Le faux serveur applique la même règle et répond 403 sinon.
 */
export function peutDecider(demande: Qui, profil: Profil | null | undefined): boolean {
  if (profil !== 'gerant' && profil !== 'proprietaire') return false;
  return validateurDe(demande) === 'proprietaire' ? profil === 'proprietaire' : true;
}

/** La caissière ne voit que ses demandes ; les autres profils les voient toutes. */
export function peutVoirToutes(profil: Profil | null | undefined): boolean {
  return profil !== 'caissier';
}

export function codeDemande(numero: number): string {
  return `DEM-${String(numero).padStart(3, '0')}`;
}

/** Écran et paramètre d'adresse où mène le lien de l'objet lié. */
export function destinationDe(objet: ObjetLie): {
  ecran: 'clients' | 'depenses' | 'personnel' | 'stocks' | 'production';
  recherche: string;
} {
  switch (objet.genre) {
    case 'client':
      return { ecran: 'clients', recherche: `?client=${encodeURIComponent(objet.id)}` };
    case 'depense':
      return { ecran: 'depenses', recherche: '' };
    case 'paie':
      return { ecran: 'personnel', recherche: '' };
    case 'inventaire':
      return { ecran: 'stocks', recherche: '' };
    case 'production':
      return { ecran: 'production', recherche: '' };
  }
}

/** En attente d'une décision, puis décisions récentes ; les plus récentes demandes d'abord. */
export function repartir(demandes: readonly Demande[]) {
  const recentesDAbord = [...demandes].sort((a, b) => b.numero - a.numero);
  return {
    enAttente: recentesDAbord.filter((d) => d.statut === 'en-attente'),
    decisions: recentesDAbord
      .filter((d) => d.statut !== 'en-attente')
      .slice(0, DECISIONS_AFFICHEES),
  };
}
