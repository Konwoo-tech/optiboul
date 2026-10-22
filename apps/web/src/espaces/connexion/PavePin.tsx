import { VisuallyHidden } from '@mantine/core';
import { useTranslation } from '@/i18n';
import { useCallback, useEffect } from 'react';

import styles from './Connexion.module.css';

export const LONGUEUR_PIN = 4;

type Props = {
  code: string;
  onChange: (code: string) => void;
  /** Les 4 chiffres sont saisis. */
  onComplet: (code: string) => void;
  /** Touche « Valider » avec les 4 chiffres saisis. */
  onValider: (code: string) => void;
  /** Échap : retour au choix de la personne. */
  onRetour: () => void;
  erreur?: string;
  /** Pendant la vérification, les touches sont ignorées. */
  occupe?: boolean;
};

const TOUCHES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

/**
 * Pastilles, message d'erreur et clavier de 64 px du code à 4 chiffres, plus le clavier
 * physique (chiffres, Retour arrière, Échap) pour une caissière qui a les mains prises.
 * Rend un fragment : les trois blocs sont les enfants directs de la colonne de saisie.
 */
export function PavePin({ code, onChange, onComplet, onValider, onRetour, erreur, occupe }: Props) {
  const { t } = useTranslation();

  const presser = useCallback(
    (touche: (typeof TOUCHES)[number]) => {
      if (occupe) return;
      if (touche === 'del') return onChange(code.slice(0, -1));
      if (touche === 'ok') return code.length === LONGUEUR_PIN ? onValider(code) : undefined;
      if (code.length >= LONGUEUR_PIN) return;
      const suivant = code + touche;
      onChange(suivant);
      if (suivant.length === LONGUEUR_PIN) onComplet(suivant);
    },
    [code, occupe, onChange, onComplet, onValider],
  );

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.ctrlKey || evenement.altKey || evenement.metaKey) return;
      if (/^[0-9]$/.test(evenement.key)) presser(evenement.key as (typeof TOUCHES)[number]);
      else if (evenement.key === 'Backspace') presser('del');
      else if (evenement.key === 'Escape') onRetour();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [presser, onRetour]);

  return (
    <>
      <VisuallyHidden aria-live="polite">
        {t('connexion.chiffresSaisis', { count: code.length, total: LONGUEUR_PIN })}
      </VisuallyHidden>
      <div className={styles.points} aria-hidden>
        {Array.from({ length: LONGUEUR_PIN }, (_, i) => (
          <span
            key={i}
            className={styles.pointPin}
            style={{ background: i < code.length ? 'var(--ob-marque)' : 'transparent' }}
          />
        ))}
      </div>
      <div className={styles.erreur} role="alert">
        {erreur}
      </div>
      <div className={styles.clavier}>
        {TOUCHES.map((touche) => {
          const texte = touche === 'del' || touche === 'ok';
          return (
            <button
              key={touche}
              type="button"
              className={[
                styles.touche,
                texte ? styles.toucheTexte : '',
                touche === 'ok' ? styles.toucheValider : '',
              ].join(' ')}
              onClick={() => presser(touche)}
            >
              {touche === 'del'
                ? t('connexion.effacer')
                : touche === 'ok'
                  ? t('connexion.valider')
                  : touche}
            </button>
          );
        })}
      </div>
    </>
  );
}
