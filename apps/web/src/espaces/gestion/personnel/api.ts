import {
  demandesAccorderCreate,
  demandesRefuserCreate,
  ErreurApi,
  getPaiesLignesBulletinRetrieveUrl,
  optiboulFetch,
  paiesElementsDestroy,
  paiesLignesElementsCreate,
  paiesLignesPayerCreate,
  paiesLignesUpdate,
  paiesPayerToutCreate,
  paiesPreparerCreate,
  paiesSoumettreCreate,
  parametresUpdate,
} from '@/api';
import { SIMULATION } from '@/simulation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lirePersonnelReel } from './reel.ts';
import type {
  InstantanePaie,
  NouveauPaiement,
  NouvelAjustement,
  PaiementDesRestes,
  ReponsePaiement,
} from './types.ts';

// En simulation, l'écran lit le faux serveur (`simulation/personnel.ts`) ; sur le vrai serveur,
// `reel.ts` compose l'instantané à partir des routes.
const RACINE = '/api/v1/simulation/gestion/personnel/';

type Reponse<T> = { data: T };

/** La clé contient la personne connectée : après un changement d'utilisateur, rien ne fuit. */
export const clePersonnel = (utilisateur: string | undefined) =>
  ['simulation', 'gestion', 'personnel', utilisateur] as const;

export function usePersonnel(utilisateur: string | undefined) {
  return useQuery({
    queryKey: clePersonnel(utilisateur),
    queryFn: async () =>
      SIMULATION
        ? (await optiboulFetch<Reponse<InstantanePaie>>(RACINE)).data
        : lirePersonnelReel(),
    enabled: Boolean(utilisateur),
    // La validation se fait aussi depuis l'écran Demandes : on relit à chaque ouverture.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

async function envoyer<T>(chemin: string, methode: string, corps?: unknown): Promise<T> {
  return (
    await optiboulFetch<Reponse<T>>(`${RACINE}${chemin}`, {
      method: methode,
      ...(corps === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
    })
  ).data;
}

const refus = (code: string) =>
  new ErreurApi(409, { code, detail: 'Action indisponible sur le serveur.' });

/** Ce que renvoie une action sur le vrai serveur : l'écran relit ensuite l'état complet. */
type Retour = { depenses?: string[] };
type Serveur<Demande> = (demande: Demande, avant: InstantanePaie) => Promise<Retour>;

/**
 * Une action sur l'état de paie : l'écran prend l'instantané renvoyé. Sur le vrai serveur, l'action
 * reçoit l'instantané lu avant (identifiants de l'état et des lignes), puis l'état est relu.
 */
function useActionPaie<Demande, Resultat extends InstantanePaie | ReponsePaiement = InstantanePaie>(
  utilisateur: string | undefined,
  simulee: (demande: Demande) => Promise<Resultat>,
  surLeServeur: Serveur<Demande>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (demande: Demande): Promise<Resultat> => {
      if (SIMULATION) return simulee(demande);
      const avant = client.getQueryData<InstantanePaie>(clePersonnel(utilisateur));
      if (!avant) throw refus('etat_inconnu');
      const retour = await surLeServeur(demande, avant);
      const instantane = await lirePersonnelReel();
      // Une action de paiement rend aussi les dépenses créées ; les autres, l'instantané seul.
      return (retour.depenses ? { instantane, depenses: retour.depenses } : instantane) as Resultat;
    },
    onSuccess: (resultat) => {
      const instantane = 'instantane' in resultat ? resultat.instantane : resultat;
      client.setQueryData(clePersonnel(utilisateur), instantane);
      // Soumettre crée une demande, payer crée des dépenses « Salaires » (budget, semaine).
      void client.invalidateQueries({ queryKey: ['simulation', 'demandes'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'comptoir', 'depenses'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'semaines'] });
      void client.invalidateQueries({ queryKey: ['simulation', 'gestion', 'tableau-de-bord'] });
    },
  });
}

const idempotence = () => ({ headers: { 'Idempotency-Key': crypto.randomUUID() } });
const etatDe = (avant: InstantanePaie) => {
  if (avant.etat === undefined) throw refus('etat_inconnu');
  return avant.etat;
};

export const useAjouterLigne = (utilisateur: string | undefined) =>
  useActionPaie<NouvelAjustement>(
    utilisateur,
    (ligne) => envoyer<InstantanePaie>('ajustements/', 'POST', ligne),
    async (ligne) => {
      await paiesLignesElementsCreate(ligne.employe, {
        genre: ligne.type,
        description: ligne.libelle,
        montant: ligne.montant,
      });
      return {};
    },
  );
export const useRetirerLigne = (utilisateur: string | undefined) =>
  useActionPaie<string>(
    utilisateur,
    (id) => envoyer<InstantanePaie>(`ajustements/${encodeURIComponent(id)}/`, 'DELETE'),
    async (id) => {
      await paiesElementsDestroy(id);
      return {};
    },
  );
/** Le serveur garde un seul jour de paie (paramètre `jour_de_paie`), le même tous les mois. */
export const useChoisirLeJour = (utilisateur: string | undefined) =>
  useActionPaie<string>(
    utilisateur,
    (jour) => envoyer<InstantanePaie>('jour/', 'PUT', { jour }),
    async (jour) => {
      await parametresUpdate('jour_de_paie', {
        valeur: Number(jour.slice(8)),
        motif: 'Jour de paie choisi depuis l’écran Personnel et paie',
      } as never);
      return {};
    },
  );
/** Le serveur n'a pas de jour de paie par mois : seul le jour commun se change (E46). */
export const usePlanifierLeMois = (utilisateur: string | undefined) =>
  useActionPaie<{ mois: string; jour: string }>(
    utilisateur,
    (demande) => envoyer<InstantanePaie>('calendrier/', 'PUT', demande),
    () => Promise.reject(refus('indisponible')),
  );
/** Absences (jours) et avances d'une ligne, tant que l'état est en brouillon (réel seulement). */
export const useModifierLigne = (utilisateur: string | undefined) =>
  useActionPaie<{ employe: string; absences: number; avances: number }>(
    utilisateur,
    () => Promise.reject(refus('indisponible')),
    async ({ employe, absences, avances }) => {
      await paiesLignesUpdate(employe, { absences: absences.toFixed(1), avances });
      return {};
    },
  );
/** Prépare le brouillon du mois : une ligne par employé actif (réel seulement). */
export const usePreparer = (utilisateur: string | undefined) =>
  useActionPaie<string>(
    utilisateur,
    (mois) => envoyer<InstantanePaie>('preparer/', 'POST', { mois }),
    async (mois) => {
      await paiesPreparerCreate({ mois: `${mois}-01` });
      return {};
    },
  );
export const useSoumettre = (utilisateur: string | undefined) =>
  useActionPaie<void>(
    utilisateur,
    () => envoyer<InstantanePaie>('soumettre/', 'POST'),
    async (_, avant) => {
      await paiesSoumettreCreate(etatDe(avant));
      return {};
    },
  );
export const usePayer = (utilisateur: string | undefined) =>
  useActionPaie<NouveauPaiement, ReponsePaiement>(
    utilisateur,
    (demande) => envoyer<ReponsePaiement>('paiements/', 'POST', demande),
    async (demande) => {
      const reponse = await paiesLignesPayerCreate(
        demande.employe,
        {
          montant: demande.montant ?? 0,
          mode: demande.mode,
          ...(demande.reference ? { reference: demande.reference } : {}),
        },
        idempotence(),
      );
      return { depenses: [String((reponse.data as { depense: number }).depense)] };
    },
  );
export const usePayerLesRestes = (utilisateur: string | undefined) =>
  useActionPaie<PaiementDesRestes, ReponsePaiement>(
    utilisateur,
    (demande) => envoyer<ReponsePaiement>('paiements/restes/', 'POST', demande),
    async (demande, avant) => {
      const reponse = await paiesPayerToutCreate(
        etatDe(avant),
        { mode: demande.mode, ...(demande.reference ? { reference: demande.reference } : {}) },
        idempotence(),
      );
      const payes = (reponse.data as { payes: number }).payes;
      return { depenses: Array.from({ length: payes }, (_, rang) => String(rang + 1)) };
    },
  );

/** Ouvre le bulletin de paie PDF d'une ligne dans un nouvel onglet (sans effet en simulation). */
export function ouvrirLeBulletin(ligne: string) {
  if (SIMULATION) return;
  window.open(getPaiesLignesBulletinRetrieveUrl(ligne), '_blank', 'noopener');
}

/** Motif envoyé avec un refus (le serveur l'exige) : l'écran n'en demande pas. */
const MOTIF_DE_REFUS = 'Refusée depuis l’écran Personnel et paie';

/** La validation ou le refus passe par l'écran Demandes : même route que lui. */
export function useDeciderLaPaie(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accord }: { id: string; accord: boolean }) => {
      if (!SIMULATION) {
        return accord
          ? demandesAccorderCreate(Number(id), {})
          : demandesRefuserCreate(Number(id), { motif: MOTIF_DE_REFUS });
      }
      return (
        await optiboulFetch<Reponse<unknown>>(`/api/v1/simulation/demandes/${id}/decider/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accord }),
        })
      ).data;
    },
    // Un refus du serveur (déjà décidée, droit) : on relit l'état et les demandes.
    onError: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: clePersonnel(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'demandes'] }),
      ]),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: clePersonnel(utilisateur) }),
        client.invalidateQueries({ queryKey: ['simulation', 'demandes'] }),
        client.invalidateQueries({ queryKey: ['simulation', 'notifications'] }),
      ]),
  });
}

/** Code d'une erreur de l'API, pour choisir le message affiché. */
export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
