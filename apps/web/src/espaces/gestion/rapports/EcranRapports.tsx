import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useState } from 'react';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import {
  ouvrirRapportDeSemaine,
  ouvrirRapportDeSession,
  ouvrirRapportDuMois,
  useRapprocher,
  useSemainesDeRapport,
  type Creneau,
  type FormatRapport,
} from './api.ts';
import styles from './Rapports.module.css';

const aujourdhui = () =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(new Date());

function ChoixFormat({
  valeur,
  onChange,
}: {
  valeur: FormatRapport;
  onChange: (format: FormatRapport) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className={styles.champ}>
      {t('gestion.rapports.format')}
      <select
        className={styles.saisie}
        value={valeur}
        onChange={(e) => onChange(e.target.value as FormatRapport)}
      >
        <option value="pdf">{t('gestion.rapports.pdf')}</option>
        <option value="excel">{t('gestion.rapports.excel')}</option>
      </select>
    </label>
  );
}

/**
 * Gestion › Rapports : les exports de la session, de la semaine et du mois (PDF ou Excel), et le
 * rapprochement d'une semaine avec les totaux d'un fichier Excel (US-150, US-151).
 */
export default function EcranRapports({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const semaines = useSemainesDeRapport(utilisateur?.name);
  const rapprocher = useRapprocher();

  const [jour, setJour] = useState(aujourdhui);
  const [creneau, setCreneau] = useState<Creneau>('nuit');
  const [formatSession, setFormatSession] = useState<FormatRapport>('pdf');
  const [semaine, setSemaine] = useState('');
  const [formatSemaine, setFormatSemaine] = useState<FormatRapport>('pdf');
  const [mois, setMois] = useState(() => aujourdhui().slice(0, 7));
  const [formatMois, setFormatMois] = useState<FormatRapport>('pdf');
  const [semaineExcel, setSemaineExcel] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);

  const liste = semaines.data ?? [];
  const semaineChoisie = semaine || String(liste[0]?.id ?? '');
  const semaineExcelChoisie = semaineExcel || String(liste[0]?.id ?? '');
  const options = liste.map((s) => (
    <option key={s.id} value={s.id}>
      {t('gestion.rapports.semaineNumero', { numero: s.numero })}
    </option>
  ));

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <div className={styles.grille}>
          <section className={styles.carte} aria-labelledby="rapport-session">
            <h2 className={styles.titre} id="rapport-session">
              {t('gestion.rapports.session.titre')}
            </h2>
            <p className={styles.aide}>{t('gestion.rapports.session.aide')}</p>
            <label className={styles.champ}>
              {t('gestion.rapports.session.jour')}
              <input
                type="date"
                className={styles.saisie}
                value={jour}
                onChange={(e) => setJour(e.target.value)}
              />
            </label>
            <label className={styles.champ}>
              {t('gestion.rapports.session.creneau')}
              <select
                className={styles.saisie}
                value={creneau}
                onChange={(e) => setCreneau(e.target.value as Creneau)}
              >
                <option value="jour">{t('creneau.jour')}</option>
                <option value="nuit">{t('creneau.nuit')}</option>
              </select>
            </label>
            <ChoixFormat valeur={formatSession} onChange={setFormatSession} />
            <button
              type="button"
              className={styles.principal}
              disabled={!jour}
              onClick={() => ouvrirRapportDeSession(jour, creneau, formatSession)}
            >
              {t('gestion.rapports.telecharger')}
            </button>
          </section>

          <section className={styles.carte} aria-labelledby="rapport-semaine">
            <h2 className={styles.titre} id="rapport-semaine">
              {t('gestion.rapports.semaine.titre')}
            </h2>
            <p className={styles.aide}>{t('gestion.rapports.semaine.aide')}</p>
            <label className={styles.champ}>
              {t('gestion.rapports.semaine.choix')}
              <select
                className={styles.saisie}
                value={semaineChoisie}
                onChange={(e) => setSemaine(e.target.value)}
              >
                {options}
              </select>
            </label>
            <ChoixFormat valeur={formatSemaine} onChange={setFormatSemaine} />
            <button
              type="button"
              className={styles.principal}
              disabled={!semaineChoisie}
              onClick={() => ouvrirRapportDeSemaine(Number(semaineChoisie), formatSemaine)}
            >
              {t('gestion.rapports.telecharger')}
            </button>
          </section>

          <section className={styles.carte} aria-labelledby="rapport-mois">
            <h2 className={styles.titre} id="rapport-mois">
              {t('gestion.rapports.mois.titre')}
            </h2>
            <p className={styles.aide}>{t('gestion.rapports.mois.aide')}</p>
            <label className={styles.champ}>
              {t('gestion.rapports.mois.choix')}
              <input
                type="month"
                className={styles.saisie}
                value={mois}
                onChange={(e) => setMois(e.target.value)}
              />
            </label>
            <ChoixFormat valeur={formatMois} onChange={setFormatMois} />
            <button
              type="button"
              className={styles.principal}
              disabled={!mois}
              onClick={() => ouvrirRapportDuMois(mois, formatMois)}
            >
              {t('gestion.rapports.telecharger')}
            </button>
          </section>
        </div>

        <section className={styles.carte} aria-labelledby="rapport-rapprochement">
          <h2 className={styles.titre} id="rapport-rapprochement">
            {t('gestion.rapports.rapprochement.titre')}
          </h2>
          <p className={styles.aide}>{t('gestion.rapports.rapprochement.aide')}</p>
          <label className={styles.champ}>
            {t('gestion.rapports.semaine.choix')}
            <select
              className={styles.saisie}
              value={semaineExcelChoisie}
              onChange={(e) => setSemaineExcel(e.target.value)}
            >
              {options}
            </select>
          </label>
          <label className={styles.champ}>
            {t('gestion.rapports.rapprochement.fichier')}
            <input
              type="file"
              accept=".csv,.xlsx"
              className={styles.saisie}
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            className={styles.principal}
            disabled={!fichier || !semaineExcelChoisie || rapprocher.isPending}
            onClick={() =>
              fichier && rapprocher.mutate({ semaine: Number(semaineExcelChoisie), fichier })
            }
          >
            {t('gestion.rapports.rapprochement.comparer')}
          </button>
          {rapprocher.isError && (
            <div className={styles.erreur} role="alert">
              {t('gestion.rapports.rapprochement.erreur')}
            </div>
          )}
          {rapprocher.data?.identique && (
            <output className={styles.resultat}>
              {t('gestion.rapports.rapprochement.identique')}
            </output>
          )}
          {rapprocher.data && !rapprocher.data.identique && (
            <>
              <div className={styles.erreur}>
                {t('gestion.rapports.rapprochement.ecarts', {
                  count: rapprocher.data.ecarts.length,
                })}
              </div>
              <ul className={styles.ecarts}>
                {rapprocher.data.ecarts.map((e) => (
                  <li className={styles.ecart} key={`${e.jour}-${e.creneau}`}>
                    {t('gestion.rapports.rapprochement.ligne', {
                      jour: e.jour,
                      creneau: t(`creneau.${e.creneau}`),
                      application: e.application
                        ? `${formaterNombre(e.application.ventes)} · ${formaterNombre(e.application.recette)}`
                        : '—',
                      excel: e.excel
                        ? `${formaterNombre(e.excel.ventes)} · ${formaterNombre(e.excel.recette)}`
                        : '—',
                    })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
