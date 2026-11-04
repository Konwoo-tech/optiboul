import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import type { ReactNode } from 'react';

import styles from './Personnel.module.css';
import { calculerPaie } from './regles.ts';
import type { Employe } from './types.ts';

const COLONNES = [
  'employe',
  'base',
  'absences',
  'avances',
  'gains',
  'penalites',
  'impaye',
  'net',
  'paye',
  'reste',
] as const;

type Props = {
  employes: Employe[];
  choisi: string;
  onChoisir: (id: string) => void;
};

const fmt = formaterNombre;

/** Cellule : l'intitulé de la colonne reste lisible par les lecteurs d'écran. */
function Cellule({
  colonne,
  className,
  children,
}: {
  colonne: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={className}>
      <span className={styles.invisible}>{colonne} : </span>
      {children}
    </span>
  );
}

/** Tableau des salaires du mois ; un clic sur une ligne ouvre la fiche de l'employé. */
export function TableauPaie({ employes, choisi, onChoisir }: Props) {
  const { t } = useTranslation();
  const nom = (cle: (typeof COLONNES)[number]) => t(`gestion.personnel.colonnes.${cle}`);

  return (
    <section className={styles.tableau} aria-label={t('gestion.personnel.salaires')}>
      <div className={styles.tableauLarge}>
        <div className={`${styles.grille} ${styles.colonnes}`} aria-hidden="true">
          {COLONNES.map((cle) => (
            <span key={cle}>{nom(cle)}</span>
          ))}
        </div>
        <ul className={styles.lignes}>
          {employes.map((employe) => {
            const c = calculerPaie(employe);
            const actif = employe.id === choisi;
            const reste =
              c.reste > 0 && c.paye > 0
                ? 'var(--ob-surveiller-texte)'
                : c.reste <= 0
                  ? 'var(--ob-ok-texte)'
                  : 'var(--ob-encre)';
            return (
              <li key={employe.id}>
                <button
                  type="button"
                  className={`${styles.grille} ${styles.ligne} ${actif ? styles.ligneChoisie : ''}`}
                  aria-pressed={actif}
                  onClick={() => onChoisir(employe.id)}
                >
                  <span className={styles.identite}>
                    <span className={styles.nom}>{employe.nom}</span>
                    <span className={styles.poste}>{employe.poste}</span>
                  </span>
                  <Cellule colonne={nom('base')}>{fmt(employe.base)}</Cellule>
                  <Cellule colonne={nom('absences')}>
                    {employe.absences
                      ? t('gestion.personnel.absencesCellule', {
                          jours: employe.absences,
                          montant: fmt(c.absences),
                        })
                      : '—'}
                  </Cellule>
                  <Cellule colonne={nom('avances')}>
                    {employe.avances ? `−${fmt(employe.avances)}` : '—'}
                  </Cellule>
                  <Cellule colonne={nom('gains')} className={styles.gain}>
                    {c.gains ? `+${fmt(c.gains)}` : '—'}
                  </Cellule>
                  <Cellule colonne={nom('penalites')} className={styles.penalite}>
                    {c.penalites ? `−${fmt(c.penalites)}` : '—'}
                  </Cellule>
                  <Cellule colonne={nom('impaye')}>
                    {employe.impaye ? `+${fmt(employe.impaye)}` : '—'}
                  </Cellule>
                  <Cellule colonne={nom('net')} className={styles.gras}>
                    {fmt(c.net)}
                  </Cellule>
                  <Cellule colonne={nom('paye')}>{c.paye ? fmt(c.paye) : '—'}</Cellule>
                  <span className={styles.gras} style={{ color: reste }}>
                    <span className={styles.invisible}>{nom('reste')} : </span>
                    {fmt(c.reste)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className={styles.formule}>{t('gestion.personnel.formule')}</p>
      </div>
    </section>
  );
}
