import { clientsImporterCreate, type RapportImport } from '@/api';
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import styles from './Sauvegardes.module.css';

/**
 * Reprise du classeur Excel (feuilles « Clients » et « Tarifs ») : on simule d'abord, on relit le
 * rapport (rejets, dettes au-delà du plafond), puis on confirme avec le même fichier.
 */
export function ImportClasseur() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [fichier, setFichier] = useState<File | null>(null);
  const [rapport, setRapport] = useState<RapportImport | null>(null);

  const envoyer = useMutation({
    mutationFn: async (confirmer: boolean) =>
      (
        await clientsImporterCreate({
          fichier: fichier as unknown as string,
          confirmer,
        })
      ).data as RapportImport,
    onSuccess: (lu) => {
      setRapport(lu);
      if (!lu.simulation) void client.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  return (
    <section className={styles.liste} aria-labelledby="titre-import">
      <h2 className={styles.titreListe} id="titre-import">
        {t('gestion.sauvegardes.import.titre')}
      </h2>
      <div className={styles.importCorps}>
        <p className={styles.sous}>{t('gestion.sauvegardes.import.aide')}</p>
        <label className={styles.importChamp}>
          {t('gestion.sauvegardes.import.fichier')}
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setFichier(e.target.files?.[0] ?? null);
              setRapport(null);
              envoyer.reset();
            }}
          />
        </label>
        <div className={styles.importActions}>
          <button
            type="button"
            className={styles.secondaire}
            disabled={!fichier || envoyer.isPending}
            onClick={() => envoyer.mutate(false)}
          >
            {t('gestion.sauvegardes.import.simuler')}
          </button>
          <button
            type="button"
            className={styles.principal}
            disabled={!rapport?.simulation || envoyer.isPending}
            onClick={() => envoyer.mutate(true)}
          >
            {t('gestion.sauvegardes.import.confirmer')}
          </button>
        </div>
        {envoyer.isError && (
          <div className={styles.importErreur} role="alert">
            {t('gestion.sauvegardes.import.erreur')}
          </div>
        )}
        {rapport && (
          <div aria-live="polite">
            <div className={styles.importResume}>
              {t(
                rapport.simulation
                  ? 'gestion.sauvegardes.import.resumeSimulation'
                  : 'gestion.sauvegardes.import.resumeFait',
                {
                  clients: formaterNombre(rapport.clients),
                  tarifs: formaterNombre(rapport.tarifs),
                  soldes: formaterNombre(rapport.soldes),
                },
              )}
            </div>
            {rapport.rejets.length > 0 && (
              <ul className={styles.importListe}>
                {rapport.rejets.map((r) => (
                  <li key={`${r.feuille}-${r.ligne}`}>
                    {t('gestion.sauvegardes.import.rejet', {
                      feuille: r.feuille,
                      ligne: r.ligne,
                      raison: r.raison,
                    })}
                  </li>
                ))}
              </ul>
            )}
            {rapport.dettes_au_dela_du_plafond.length > 0 && (
              <div className={styles.importErreur}>
                {t('gestion.sauvegardes.import.auDela', {
                  count: rapport.dettes_au_dela_du_plafond.length,
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
