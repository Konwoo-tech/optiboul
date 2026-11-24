import {
  caissesProchaineRetrieve,
  optiboulFetch,
  postesActuelRetrieve,
  type PosteActuel,
  type Semaine,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { SIMULATION, useContexteSimule, type ContexteSimule } from '@/simulation';
import { useQuery } from '@tanstack/react-query';

const FUSEAU = 'Africa/Douala';
const ACTUALISATION_MS = 60_000;

/** « 18:02 » : l'heure de Yaoundé d'un instant ISO. */
function heureDe(instant: string | null | undefined): string {
  if (!instant) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU,
  }).format(new Date(instant));
}

type CaisseEnCours = { ouverte_le: string | null; caissiere: { nom: string } } | null;
type ProchaineLue = { creneau?: string; caisse_en_cours?: CaisseEnCours } | null;

/**
 * Ce que la coque affiche partout : semaine ouverte, gérant et responsable de production, session
 * de caisse en cours, poste. Il est composé de trois lectures : `GET /semaines/?statut=ouverte`,
 * `GET /caisses/prochaine/` et `GET /postes/actuel/`. Une lecture refusée (droits du profil, poste
 * non reconnu) est simplement absente. Sans semaine ouverte, il n'y a pas de contexte à montrer.
 */
// `null` et non `undefined` : une requête ne peut pas rendre `undefined`.
async function lireContexte(): Promise<ContexteSimule | null> {
  const [semaines, prochaine, poste] = await Promise.all([
    optiboulFetch<{ data: { results?: Semaine[] } }>('/api/v1/semaines/?statut=ouverte').catch(
      () => null,
    ),
    caissesProchaineRetrieve().catch(() => null),
    postesActuelRetrieve().catch(() => null),
  ]);
  const semaine = semaines?.data.results?.[0];
  if (!semaine) return null;
  const lue = (prochaine?.data ?? null) as ProchaineLue;
  const caisse = lue?.caisse_en_cours ?? null;
  const creneau = lue?.creneau === 'jour' || lue?.creneau === 'nuit' ? lue.creneau : undefined;
  const nomDuPoste = (poste?.data as { poste?: { nom?: string } } | undefined)?.poste?.nom;
  return {
    poste: nomDuPoste ?? '',
    gerantDeLaSemaine: semaine.gerant?.nom ?? '',
    responsableProduction: semaine.production?.nom ?? '',
    caissierDeSession: caisse?.caissiere.nom ?? '',
    semaine: { numero: semaine.numero, du: semaine.du, au: semaine.au },
    sessionOuverteDepuis: heureDe(caisse?.ouverte_le),
    sessionType: creneau,
    sessionOuverte: caisse !== null,
  };
}

/**
 * Avant la connexion : ce que le serveur dit d'un poste de confiance (#307) — la semaine, son
 * gérant et la session ouverte. Hors poste de confiance, il ne dit rien (`contexte` nul).
 */
async function lireContexteDuPoste(): Promise<ContexteSimule | null> {
  const reponse = await postesActuelRetrieve().catch(() => null);
  const lu = reponse?.data as PosteActuel | undefined;
  const semaine = lu?.contexte?.semaine;
  if (!semaine) return null;
  const session = lu?.contexte?.session ?? null;
  return {
    poste: lu?.poste?.nom ?? '',
    gerantDeLaSemaine: semaine.gerant ?? '',
    responsableProduction: semaine.production ?? '',
    caissierDeSession: session?.caissiere ?? '',
    semaine: { numero: semaine.numero, du: semaine.du, au: semaine.au },
    sessionOuverteDepuis: heureDe(session?.ouverte_le),
    sessionType:
      session?.creneau === 'jour' || session?.creneau === 'nuit' ? session.creneau : undefined,
    sessionOuverte: session !== null,
  };
}

/**
 * Le contexte de la coque : sur le vrai serveur après la connexion ; en simulation, celui du faux
 * serveur. Avant la connexion, sur un poste de confiance seulement : celui que le serveur donne
 * pour le poste (#307).
 */
export function useContexte() {
  const { utilisateur } = useUtilisateurCourant();
  const simule = useContexteSimule();
  const reel = useQuery({
    queryKey: ['coque', 'contexte', utilisateur?.url],
    queryFn: lireContexte,
    enabled: !SIMULATION && Boolean(utilisateur),
    staleTime: ACTUALISATION_MS / 2,
    refetchInterval: ACTUALISATION_MS,
  });
  const duPoste = useQuery({
    queryKey: ['coque', 'contexte-poste'],
    queryFn: lireContexteDuPoste,
    enabled: !SIMULATION && !utilisateur,
    staleTime: ACTUALISATION_MS / 2,
    refetchInterval: ACTUALISATION_MS,
  });
  return { data: SIMULATION ? simule.data : (reel.data ?? duPoste.data ?? undefined) };
}
