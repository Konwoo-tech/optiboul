import {
  caissesEspecesRetrieve,
  caissesFermerCreate,
  caissesList,
  caissesOuvrirCreate,
  caissesProchaineRetrieve,
  caissesRecapitulatifList,
  caissesRemettreCreate,
  caissesRouvrirCreate,
  optiboulFetch,
  toutesLesPages,
  type Caisse,
  type Recapitulatif,
  type Semaine,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PLAFOND_CAISSE } from './regles.ts';
import type {
  DetailEspeces,
  FermetureDemandee,
  OuvertureDemandee,
  ReouvertureDemandee,
  RemiseDemandee,
  RemiseEnregistree,
  ReponseCaisses,
  SessionCaisse,
} from './types.ts';

/** Receveur « le coffre » d'une remise : le serveur le reconnaît à l'absence de receveur. */
export const COFFRE = 'coffre';

/** Clé des caisses : elle contient la personne connectée, pour ne jamais montrer celles d'une autre. */
export const cleCaisses = (utilisateur: string | undefined) =>
  ['comptoir', 'caisses', utilisateur] as const;

export const heureDeYaounde = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Douala',
  }).format(new Date(iso));

/** Une caisse du vrai serveur, telle que le tableau la lit. */
export function versSessionDeCaisse(caisse: Caisse, especes: DetailEspeces | null): SessionCaisse {
  const caissiere = { id: String(caisse.caissiere.id), nom: caisse.caissiere.nom };
  return {
    id: String(caisse.id),
    jour: caisse.jour,
    type: caisse.creneau === 'jour' ? 'jour' : 'nuit',
    caissiere,
    ouverture: { heure: heureDeYaounde(caisse.ouverte_le), par: caisse.ouverte_par.nom },
    // `fermee_par` : qui a fermé la caisse (#312) ; absent tant qu'elle est ouverte.
    fermeture: caisse.fermee_le
      ? {
          heure: heureDeYaounde(caisse.fermee_le),
          par: (caisse.fermee_par ?? caisse.caissiere).nom,
        }
      : null,
    fonds: caisse.fonds,
    attendu: caisse.attendu ?? especes?.attendu ?? caisse.fonds,
    compte: caisse.compte,
    recette: caisse.recette,
    enCours: caisse.en_cours,
  };
}

/**
 * Compose `GET /caisses/` (toutes les pages), `recapitulatif`, `prochaine` et `{id}/especes` en la
 * réponse de l'écran. Le serveur ne donne pas la liste des caissières ni les personnes qui reçoivent
 * une remise : les caissières viennent des caisses, les receveurs seront branchés avec la remise (#271).
 */
export async function lireCaisses(moi: string): Promise<ReponseCaisses> {
  const [caisses, recapitulatif, prochaine, semaines] = await Promise.all([
    toutesLesPages<Caisse>(
      (page) =>
        caissesList({ page }) as Promise<{ data: { results?: Caisse[]; next?: string | null } }>,
    ),
    caissesRecapitulatifList()
      .then((r) => r.data as Recapitulatif[])
      .catch(() => [] as Recapitulatif[]),
    caissesProchaineRetrieve(),
    optiboulFetch<{ data: { results?: Semaine[] } }>('/api/v1/semaines/?statut=ouverte').catch(
      () => null,
    ),
  ]);
  const gerant = semaines?.data.results?.[0]?.gerant;
  // La caissière ne reçoit que ses caisses : la caisse ouverte d'une autre vient de `prochaine`.
  const ouverte = caisses.find((c) => c.en_cours) ?? prochaine.data.caisse_en_cours ?? undefined;
  // Le détail des espèces (fonds, encaissé, dépenses, remises) de la caisse ouverte, ou à défaut de la
  // dernière fermée : le récapitulatif de clôture annonce ses dépenses. Réservé à qui peut voir la caisse.
  const caisseDuDetail =
    ouverte ?? caisses.toSorted((a, b) => b.ouverte_le.localeCompare(a.ouverte_le))[0];
  const especes = caisseDuDetail
    ? await caissesEspecesRetrieve(caisseDuDetail.id)
        .then((r) => r.data as DetailEspeces & { plafond: number })
        .catch(() => null)
    : null;
  const detail: DetailEspeces | null = especes
    ? {
        fonds: especes.fonds,
        especes: especes.especes,
        depenses: especes.depenses,
        remises: especes.remises,
        attendu: especes.attendu,
      }
    : null;
  // Les plus anciennes d'abord, la caisse ouverte à la fin.
  const sessions = caisses
    .toSorted((a, b) => a.ouverte_le.localeCompare(b.ouverte_le))
    .map((c) => versSessionDeCaisse(c, c.en_cours ? detail : null));
  // `detail` appartient à la caisse ouverte, sinon à la dernière fermée (lu par l'écran Session).
  const triees = [...sessions.filter((s) => !s.enCours), ...sessions.filter((s) => s.enCours)];
  const personnes = new Map<string, { id: string; nom: string }>();
  for (const { caissiere } of recapitulatif) {
    personnes.set(String(caissiere.id), { id: String(caissiere.id), nom: caissiere.nom });
  }
  for (const s of triees) personnes.set(s.caissiere.id, s.caissiere);
  const derniere = triees.at(-1);
  const planifiee = prochaine.data.planifiee;
  return {
    moi,
    caissieres: [...personnes.values()],
    sessions: triees,
    caisseOuverte: ouverte
      ? (() => {
          const s =
            triees.find((x) => x.id === String(ouverte.id)) ?? versSessionDeCaisse(ouverte, null);
          return {
            id: s.id,
            jour: s.jour,
            type: s.type,
            caissiere: s.caissiere,
            ouverture: s.ouverture,
          };
        })()
      : null,
    detail,
    prochaine: {
      type: prochaine.data.creneau === 'jour' ? 'jour' : 'nuit',
      jour: prochaine.data.jour,
      planifiee: planifiee ? { id: String(planifiee.id), nom: planifiee.nom } : null,
    },
    rouvrable: Boolean(derniere && !derniere.enCours),
    plafond: especes?.plafond ?? PLAFOND_CAISSE,
    // Le serveur ne liste pas les receveurs possibles : le gérant de la semaine, ou le coffre.
    receveurs: [
      ...(gerant ? [{ id: String(gerant.id), nom: gerant.nom }] : []),
      { id: COFFRE, nom: '' },
    ],
    recapitulatif: Object.fromEntries(
      recapitulatif.map((r) => [
        String(r.caissiere.id),
        { ouvertures: r.ouvertures, recette: r.recette, ecart: r.ecart_cumule },
      ]),
    ),
  };
}

/** Caisses visibles par la personne connectée (la caissière ne reçoit que les siennes). */
export function useCaisses(utilisateur: string | undefined) {
  const { utilisateur: connecte } = useUtilisateurCourant();
  return useQuery({
    queryKey: cleCaisses(utilisateur),
    queryFn: () => lireCaisses(String(connecte?.id ?? '')),
    enabled: Boolean(utilisateur) && Boolean(connecte),
    // Les espèces bougent à chaque livraison et chaque dépense : on relit à chaque ouverture de l'écran.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Une action sur les caisses, puis rechargement de la liste. */
function useActionCaisse<Demande extends object, Resultat = undefined>(
  utilisateur: string | undefined,
  /** L'action sur le serveur. */
  surLeServeur: (demande: Demande) => Promise<Resultat>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (demande: Demande): Promise<Resultat> => surLeServeur(demande),
    // La pastille « Session … » de l'en-tête dérive du contexte : on le relit aussi.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cleCaisses(utilisateur) }),
        client.invalidateQueries({ queryKey: ['ecran', 'contexte'] }),
        client.invalidateQueries({ queryKey: ['coque', 'contexte'] }),
      ]),
  });
}

const sansCaisse = () => Promise.reject(new Error('Aucune caisse choisie'));

export const useOuvrirCaisse = (utilisateur: string | undefined) =>
  useActionCaisse<OuvertureDemandee>(utilisateur, async ({ fonds }) => {
    await caissesOuvrirCreate({ fonds });
  });

/** Ferme la caisse ouverte (`idCaisse`) avec le comptage des espèces. */
export const useFermerCaisse = (utilisateur: string | undefined, idCaisse?: string) =>
  useActionCaisse<FermetureDemandee>(utilisateur, async ({ compte }) => {
    if (!idCaisse) return sansCaisse();
    await caissesFermerCreate(Number(idCaisse), { compte });
  });

/** Rouvre la dernière caisse fermée (`idCaisse`), avec son motif. */
export const useRouvrirCaisse = (utilisateur: string | undefined, idCaisse?: string) =>
  useActionCaisse<ReouvertureDemandee>(utilisateur, async ({ motif }) => {
    if (!idCaisse) return sansCaisse();
    await caissesRouvrirCreate(Number(idCaisse), { motif });
  });

/**
 * Remet des espèces au coffre ou à un gérant. La clé d'idempotence est tirée à chaque envoi : un
 * double clic ne remet pas deux fois la même somme.
 */
export const useRemettreAuCoffre = (utilisateur: string | undefined, idCaisse?: string) =>
  useActionCaisse<RemiseDemandee, RemiseEnregistree>(utilisateur, async ({ montant, receveur }) => {
    if (!idCaisse) return sansCaisse();
    const reponse = await caissesRemettreCreate(
      Number(idCaisse),
      { montant, receveur: receveur === COFFRE ? null : Number(receveur) },
      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
    );
    return { attendu: (reponse.data as { attendu: number }).attendu, receveur, heure: '' };
  });
