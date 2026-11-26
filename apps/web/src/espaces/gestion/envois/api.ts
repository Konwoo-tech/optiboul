import { envoisEtatRetrieve, envoisList, envoisRelancerCreate, ErreurApi } from '@/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const STATUTS_ENVOI = ['en_attente', 'envoye', 'echec'] as const;
export type StatutEnvoi = (typeof STATUTS_ENVOI)[number];
export type FiltreEnvoi = StatutEnvoi | 'tous';

/** Un message de la file d'envoi, avec les champs que le serveur donne en plus du résumé. */
export type MessageEnvoi = {
  id: number;
  canal: 'sms' | 'whatsapp' | 'email';
  destinataire: string;
  sujet?: string;
  statut: StatutEnvoi;
  tentatives?: number;
  derniere_erreur?: string;
  cree_le: string;
  envoye_le: string | null;
};

export type EtatEnvois = {
  internet: 'en_ligne' | 'hors_ligne' | 'inconnu';
  en_attente: number;
  en_echec: number;
};

const cle = (utilisateur: string | undefined, filtre: FiltreEnvoi) =>
  ['ecran', 'gestion', 'envois', utilisateur, filtre] as const;

/** La file d'envoi (SMS, WhatsApp, e-mail), les plus récents d'abord. */
export function useEnvois(utilisateur: string | undefined, filtre: FiltreEnvoi) {
  return useQuery({
    queryKey: cle(utilisateur, filtre),
    queryFn: async () => {
      const [liste, etat] = await Promise.all([
        envoisList(filtre === 'tous' ? {} : { statut: filtre }),
        envoisEtatRetrieve(),
      ]);
      const corps = liste.data as { count?: number; results?: MessageEnvoi[] };
      return {
        total: corps.count ?? corps.results?.length ?? 0,
        messages: corps.results ?? [],
        etat: etat.data as EtatEnvois,
      };
    },
    enabled: Boolean(utilisateur),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Remet un envoi en échec dans la file : \`POST /envois/{id}/relancer/\`. */
export function useRelancerEnvoi(utilisateur: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => envoisRelancerCreate(id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['ecran', 'gestion', 'envois', utilisateur] }),
  });
}

export function codeErreur(erreur: unknown): string | undefined {
  return erreur instanceof ErreurApi ? erreur.code : undefined;
}
