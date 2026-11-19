import {
  ErreurApi,
  postesActuelRetrieve,
  postesCreate,
  postesList,
  postesRevoquerCreate,
  toutesLesPages,
  type Poste,
} from '@/api';
import { useTranslation } from '@/i18n';
import { useToast } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';

import styles from '../espaces/comptoir/caisses/Fenetres.module.css';

const CLE = ['securite', 'postes'] as const;

/**
 * Postes de confiance (US-022) : les navigateurs autorisés à la connexion par code. Réservé à
 * l'administrateur. Enregistrer pose le cookie du poste sur le navigateur utilisé : on ne
 * l'enregistre donc que depuis la boulangerie (le serveur refuse l'accès distant).
 */
export function PostesDeConfiance() {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const client = useQueryClient();
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [aRevoquer, setARevoquer] = useState<number | null>(null);

  const liste = useQuery({
    queryKey: CLE,
    queryFn: async () => ({
      postes: await toutesLesPages((page) => postesList({ page })),
      actuel: ((await postesActuelRetrieve()).data as { poste: Poste | null }).poste?.id ?? null,
    }),
  });
  const relire = () => client.invalidateQueries({ queryKey: CLE });

  const enregistrer = useMutation({
    mutationFn: (valeur: string) => postesCreate({ nom: valeur }),
    onSuccess: () => {
      setNom('');
      afficher(t('securite.postes.enregistre'));
      void relire();
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.status === 403) setErreur('distant');
      else if (e instanceof ErreurApi && e.status === 400) setErreur('nom');
      else setErreur('defaut');
    },
  });
  const revoquer = useMutation({
    mutationFn: (id: number) => postesRevoquerCreate(id),
    onSuccess: () => {
      setARevoquer(null);
      afficher(t('securite.postes.revoque'));
      void relire();
    },
    onError: () => {
      setARevoquer(null);
      afficher(t('securite.erreur'));
    },
  });

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!nom.trim()) {
      setErreur('nom');
      return;
    }
    setErreur(null);
    enregistrer.mutate(nom.trim());
  };
  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
      : t('securite.postes.jamais');

  return (
    <section className={styles.formulaire} aria-label={t('securite.postes.titre')}>
      <div className={styles.creneauTitre}>{t('securite.postes.titre')}</div>
      <div className={styles.discret}>{t('securite.postes.aide')}</div>
      {liste.isLoading && <div className={styles.discret}>{t('securite.chargement')}</div>}
      {liste.isError && (
        <div className={styles.erreur} role="alert">
          {t('securite.erreur')}
        </div>
      )}
      {liste.data?.postes.map((poste) => (
        <div key={poste.id} className={styles.creneauTitre}>
          <strong>{poste.nom}</strong>
          {poste.id === liste.data.actuel && <span> · {t('securite.postes.ceNavigateur')}</span>}
          <div className={styles.discret}>
            {poste.actif
              ? t('securite.postes.actif')
              : t('securite.postes.revoqueLe', { date: date(poste.revoque_le) })}
            {' · '}
            {t('securite.postes.enregistreLe', { date: date(poste.cree_le), par: poste.cree_par })}
            {' · '}
            {t('securite.postes.dernierUsage', { date: date(poste.dernier_usage) })}
          </div>
          {poste.actif &&
            (aRevoquer === poste.id ? (
              <div className={styles.actions}>
                <button type="button" className={styles.annuler} onClick={() => setARevoquer(null)}>
                  {t('securite.annuler')}
                </button>
                <button
                  type="button"
                  className={styles.confirmer}
                  disabled={revoquer.isPending}
                  onClick={() => revoquer.mutate(poste.id)}
                >
                  {t('securite.postes.confirmerRevocation', { nom: poste.nom })}
                </button>
              </div>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.annuler}
                  onClick={() => setARevoquer(poste.id)}
                >
                  {t('securite.postes.revoquer', { nom: poste.nom })}
                </button>
              </div>
            ))}
        </div>
      ))}
      <form className={styles.formulaire} onSubmit={envoyer} noValidate>
        <label className={styles.champ}>
          {t('securite.postes.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={100}
            aria-invalid={erreur ? true : undefined}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {t(`securite.postes.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.confirmer} disabled={enregistrer.isPending}>
            {t('securite.postes.enregistrer')}
          </button>
        </div>
      </form>
    </section>
  );
}
