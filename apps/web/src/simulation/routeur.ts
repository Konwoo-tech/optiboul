import { formaterHeure } from '@/utils';

import {
  CODE_DEMO,
  CODE_OTP_DEMO,
  COMPTES_SIMULES,
  MOT_DE_PASSE_DEMO,
  UTILISATEURS_SIMULES,
  type CompteSimule,
  type ContexteSimule,
} from './donnees.ts';
import { reinitialiserClients, repondreClients } from './clients.ts';
import {
  adapterNotificationsAuComptoir,
  reinitialiserComptoir,
  repondreComptoir,
} from './comptoir.ts';
import { reinitialiserDepenses, repondreDepenses } from './depenses.ts';
import { contexteCaisses, reinitialiserCaisses, repondreCaisses } from './caisses.ts';
import { repondreDemandes } from './demandes.ts';
import { reinitialiserNumerosDemandes } from './numerosDemandes.ts';
import { NOTIFICATIONS_PAR_PROFIL } from './notifications.ts';
import { lireUtilisateurConnecte, memoriserUtilisateurConnecte } from './session.ts';

/** La session « s'ouvre » au chargement de la page, comme dans la maquette. */
const OUVERTE_A = formaterHeure(new Date());

const CONTEXTE: ContexteSimule = {
  poste: 'PC du comptoir',
  gerantDeLaSemaine: 'Willy',
  responsableProduction: 'Serge',
  caissierDeSession: 'Davy',
  semaine: { numero: 42, du: '2026-10-12', au: '2026-10-18' },
  sessionOuverteDepuis: OUVERTE_A,
};

export type Via = 'code' | 'e-mail' | 'Google';
export type Canal = 'sms' | 'whatsapp';

/** Nombre d'essais de code SMS / WhatsApp avant de devoir en demander un nouveau. */
export const ESSAIS_MAX = 3;

/** Identification réussie, en attente de la double authentification. */
type EnAttente = { compte: CompteSimule; via: Via; canal: Canal; envoye: boolean; essais: number };
let enAttente: EnAttente | null = null;

/** Notifications lues, par utilisateur. */
const lues = new Map<string, Set<string>>();

/** Remet le serveur simulé à zéro (tests). */
export function reinitialiserSimulation(): void {
  enAttente = null;
  lues.clear();
  reinitialiserClients();
  reinitialiserCaisses();
  reinitialiserComptoir();
  reinitialiserDepenses();
  reinitialiserNumerosDemandes();
  memoriserUtilisateurConnecte(null);
}

const probleme = (status: number, code: string, detail: string, autres: object = {}) =>
  Response.json({ detail, code, ...autres }, { status });

const sansContenu = () => new Response(null, { status: 204 });

type Corps = Record<string, unknown>;

/** « 6 77 41 20 18 » → « +237 6 •• •• 20 18 » : le numéro n'apparaît jamais en entier. */
export function masquerTelephone(telephone: string): string {
  return `+237 ${telephone.slice(0, 1)} •• •• ${telephone.slice(-5)}`;
}

function projeter({ id, nom, profil, email }: CompteSimule) {
  return { id, nom, profil, email };
}

function identifier(corps: Corps): Response {
  const methode = corps.methode;
  let compte: CompteSimule | undefined;
  let via: Via;

  if (methode === 'code') {
    via = 'code';
    compte = COMPTES_SIMULES.find((c) => c.id === corps.utilisateur);
    if (!compte) return probleme(400, 'utilisateur_inconnu', 'Utilisateur inconnu.');
    if (corps.code !== CODE_DEMO) return probleme(400, 'code_incorrect', 'Code incorrect.');
  } else if (methode === 'email') {
    via = 'e-mail';
    const saisi = String(corps.email ?? '')
      .trim()
      .toLowerCase();
    compte = COMPTES_SIMULES.find((c) => c.email === saisi || c.id === saisi);
    if (!compte || corps.motDePasse !== MOT_DE_PASSE_DEMO) {
      return probleme(400, 'identifiants_incorrects', 'E-mail ou mot de passe incorrect.');
    }
  } else if (methode === 'google') {
    via = 'Google';
    compte = COMPTES_SIMULES.find((c) => c.email === String(corps.email ?? '').toLowerCase());
    if (!compte) return probleme(400, 'compte_inconnu', 'Compte Google non autorisé.');
  } else {
    return probleme(400, 'methode_inconnue', 'Méthode de connexion inconnue.');
  }

  if (corps.deuxFacteurs === false) {
    memoriserUtilisateurConnecte(compte.id);
    return Response.json({ deuxFacteurs: false });
  }
  enAttente = { compte, via, canal: 'sms', envoye: false, essais: 0 };
  return Response.json({
    deuxFacteurs: true,
    utilisateur: projeter(compte),
    telephoneMasque: masquerTelephone(compte.telephone),
    via,
  });
}

function envoyerCode(corps: Corps): Response {
  if (!enAttente) return probleme(409, 'aucune_identification', 'Identifiez-vous d’abord.');
  enAttente.canal = corps.canal === 'whatsapp' ? 'whatsapp' : 'sms';
  enAttente.envoye = true;
  enAttente.essais = 0;
  return Response.json({ heure: formaterHeure(new Date()) });
}

function verifierCode(corps: Corps): Response {
  if (!enAttente?.envoye) return probleme(409, 'aucun_code_envoye', 'Demandez d’abord un code.');
  if (enAttente.essais >= ESSAIS_MAX) {
    return probleme(400, 'trop_d_essais', 'Trop d’essais.', { essaisRestants: 0 });
  }
  if (corps.code === CODE_OTP_DEMO) {
    memoriserUtilisateurConnecte(enAttente.compte.id);
    enAttente = null;
    return sansContenu();
  }
  enAttente.essais += 1;
  const essaisRestants = ESSAIS_MAX - enAttente.essais;
  return probleme(
    400,
    essaisRestants === 0 ? 'trop_d_essais' : 'code_incorrect',
    'Code incorrect.',
    { essaisRestants },
  );
}

/** Réponses simulées de l'API, au format du vrai backend (RFC 9457 pour les erreurs). */
export function repondre(url: URL, methode: string, corps: Corps): Response {
  const chemin = url.pathname;
  const appel = `${methode} ${chemin}`;

  switch (appel) {
    case 'GET /api/v1/sante/':
      return Response.json({ statut: 'ok', base: true });

    case 'GET /api/v1/users/me/': {
      const utilisateur = lireUtilisateurConnecte();
      if (!utilisateur) {
        return probleme(403, 'non_authentifie', "Informations d'authentification non fournies.");
      }
      return Response.json({
        url: `${url.origin}/api/v1/users/${utilisateur.id}/`,
        name: utilisateur.nom,
        profil: utilisateur.profil,
      });
    }

    case 'GET /api/v1/simulation/utilisateurs/':
      return Response.json(UTILISATEURS_SIMULES);

    case 'GET /api/v1/simulation/contexte/':
      return Response.json({ ...CONTEXTE, ...contexteCaisses() });

    case 'POST /api/v1/simulation/identification/':
      return identifier(corps);

    case 'POST /api/v1/simulation/identification/annuler/':
      enAttente = null;
      return sansContenu();

    case 'POST /api/v1/simulation/otp/envoyer/':
      return envoyerCode(corps);

    case 'POST /api/v1/simulation/otp/verifier/':
      return verifierCode(corps);

    case 'GET /api/v1/simulation/notifications/': {
      const utilisateur = lireUtilisateurConnecte();
      if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
      const vues = lues.get(utilisateur.id);
      return Response.json(
        adapterNotificationsAuComptoir(NOTIFICATIONS_PAR_PROFIL[utilisateur.profil]).map((n) => ({
          ...n,
          lue: vues?.has(n.id) ?? false,
        })),
      );
    }

    case 'POST /api/v1/simulation/notifications/lues/': {
      const utilisateur = lireUtilisateurConnecte();
      if (!utilisateur) return probleme(403, 'non_authentifie', 'Connexion requise.');
      const vues = lues.get(utilisateur.id) ?? new Set<string>();
      for (const id of Array.isArray(corps.ids) ? corps.ids : []) vues.add(String(id));
      lues.set(utilisateur.id, vues);
      return sansContenu();
    }

    case 'POST /api/v1/simulation/deconnexion/':
      enAttente = null;
      memoriserUtilisateurConnecte(null);
      return sansContenu();

    default:
      return (
        repondreClients(methode, chemin, corps) ??
        repondreCaisses(chemin, methode, corps) ??
        repondreComptoir(url, methode, corps) ??
        repondreDepenses(url, methode, corps) ??
        repondreDemandes(methode, chemin, corps) ??
        probleme(404, 'non_simule', `Pas encore simulé : ${methode} ${chemin}`)
      );
  }
}

async function lireCorps(entree: RequestInfo | URL, init?: RequestInit): Promise<Corps> {
  const brut = init?.body ?? (entree instanceof Request ? await entree.clone().text() : undefined);
  if (typeof brut !== 'string' || !brut) return {};
  try {
    return JSON.parse(brut) as Corps;
  } catch {
    return {};
  }
}

const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Remplace `fetch` : les appels à `/api/…` reçoivent les réponses simulées, le reste (polices,
 * fichiers) passe par le vrai `fetch`. Renvoie une fonction qui rétablit l'original.
 */
export function installerApiSimulee({ latenceMs = 120 }: { latenceMs?: number } = {}) {
  const fetchReel = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (entree, init) => {
    const adresse = entree instanceof Request ? entree.url : String(entree);
    const url = new URL(adresse, globalThis.location?.href ?? 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return fetchReel(entree, init);
    const methode = (
      init?.method ?? (entree instanceof Request ? entree.method : 'GET')
    ).toUpperCase();
    // La latence rend visibles les états de chargement, comme avec un vrai serveur.
    await attendre(latenceMs);
    return repondre(url, methode, await lireCorps(entree, init));
  };
  return () => {
    globalThis.fetch = fetchReel;
  };
}
