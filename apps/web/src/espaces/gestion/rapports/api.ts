import {
  getRapportsMoisRetrieveUrl,
  getRapportsSemaineRetrieveUrl,
  getRapportsSessionRetrieveUrl,
  rapportsRapprochementCreate,
  semainesList,
  toutesLesPages,
  type Ecart,
  type Semaine,
} from '@/api';
import { useMutation, useQuery } from '@tanstack/react-query';

export type FormatRapport = 'pdf' | 'excel';
export type Creneau = 'jour' | 'nuit';

type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Les semaines proposées aux rapports de semaine et au rapprochement : la plus récente d'abord. */
export function useSemainesDeRapport(utilisateur: string | undefined) {
  return useQuery({
    queryKey: ['ecran', 'gestion', 'rapports', 'semaines', utilisateur],
    queryFn: async () => {
      const semaines = await toutesLesPages<Semaine>(
        (page) => semainesList({ page }) as Promise<Page<Semaine>>,
      );
      return [...semaines].sort((a, b) => b.numero - a.numero);
    },
    enabled: Boolean(utilisateur),
  });
}

/** Ouvre le rapport dans un nouvel onglet : le navigateur porte la session et télécharge le fichier. */
export function ouvrirRapportDeSession(jour: string, creneau: Creneau, format: FormatRapport) {
  window.open(
    getRapportsSessionRetrieveUrl({ jour, creneau, format_fichier: format }),
    '_blank',
    'noopener',
  );
}

export function ouvrirRapportDeSemaine(semaine: number, format: FormatRapport) {
  window.open(
    getRapportsSemaineRetrieveUrl({ semaine, format_fichier: format }),
    '_blank',
    'noopener',
  );
}

export function ouvrirRapportDuMois(mois: string, format: FormatRapport) {
  window.open(getRapportsMoisRetrieveUrl({ mois, format_fichier: format }), '_blank', 'noopener');
}

export type ResultatRapprochement = { identique: boolean; ecarts: Ecart[] };

/** Compare la semaine, session par session, aux totaux d'un fichier Excel. */
export function useRapprocher() {
  return useMutation({
    mutationFn: async ({
      semaine,
      fichier,
    }: {
      semaine: number;
      fichier: File;
    }): Promise<ResultatRapprochement> => {
      const reponse = await rapportsRapprochementCreate({
        semaine,
        fichier: fichier as unknown as string,
      });
      return reponse.data as ResultatRapprochement;
    },
  });
}
