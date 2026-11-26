import { useTranslation } from '@/i18n';
import { FenetreModale, estTexteDuServeur, texteDuServeur } from '@/ui';
import { useEffect, useState, type SubmitEvent } from 'react';

import styles from '../../comptoir/caisses/Fenetres.module.css';
import { lireRotation } from './api.ts';
import type { Personne } from './types.ts';

export type NouvelleSemaine = {
  annee: number;
  numero: number;
  gerant: string;
  production: string;
};

type Props = {
  /** Année et numéro proposés : la semaine qui suit la dernière planifiée. */
  proposee: { annee: number; numero: number };
  gerants: readonly Personne[];
  responsables: readonly Personne[];
  envoiEnCours: boolean;
  /** Renvoie la clé du message d'erreur, ou `null` quand la semaine est planifiée. */
  onConfirmer: (semaine: NouvelleSemaine) => Promise<string | null>;
  onFermer: () => void;
};

const chiffres = (valeur: string) => valeur.replace(/\D/g, '');

/** Planifier une semaine : le gérant et le responsable de production sont proposés par la rotation. */
export function ModalePlanification({
  proposee,
  gerants,
  responsables,
  envoiEnCours,
  onConfirmer,
  onFermer,
}: Props) {
  const { t } = useTranslation();
  const [annee, setAnnee] = useState(String(proposee.annee));
  const [numero, setNumero] = useState(String(proposee.numero));
  const [gerant, setGerant] = useState('');
  const [production, setProduction] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  // La rotation propose l'équipe de la semaine choisie ; la personne peut en changer ensuite.
  useEffect(() => {
    const a = Number(annee);
    const n = Number(numero);
    if (!(a >= 2026 && n >= 1 && n <= 53)) return;
    let courant = true;
    lireRotation(a, n)
      .then((rotation) => {
        if (!courant) return;
        setGerant(rotation.gerant ? String(rotation.gerant) : '');
        setProduction(rotation.production ? String(rotation.production) : '');
      })
      .catch(() => undefined);
    return () => {
      courant = false;
    };
  }, [annee, numero]);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const a = Number(annee);
    const n = Number(numero);
    if (!(a >= 2026 && a <= 2100 && n >= 1 && n <= 53)) return setErreur('numero');
    const refus = await onConfirmer({ annee: a, numero: n, gerant, production });
    if (refus) setErreur(refus);
  };

  return (
    <FenetreModale titre={t('gestion.semaines.planification.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <label className={styles.champ}>
          {t('gestion.semaines.planification.annee')}
          <input
            className={styles.texte}
            value={annee}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => {
              setAnnee(chiffres(e.target.value));
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.semaines.planification.numero')}
          <input
            className={styles.texte}
            value={numero}
            inputMode="numeric"
            maxLength={2}
            onChange={(e) => {
              setNumero(chiffres(e.target.value));
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('gestion.semaines.planification.gerant')}
          <select
            className={styles.texte}
            value={gerant}
            onChange={(e) => setGerant(e.target.value)}
          >
            <option value="">{t('gestion.semaines.carte.choisir')}</option>
            {gerants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.champ}>
          {t('gestion.semaines.planification.production')}
          <select
            className={styles.texte}
            value={production}
            onChange={(e) => setProduction(e.target.value)}
          >
            <option value="">{t('gestion.semaines.carte.choisir')}</option>
            {responsables.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.discret}>{t('gestion.semaines.planification.note')}</div>
        {erreur && (
          <div className={styles.erreur} role="alert">
            {estTexteDuServeur(erreur)
              ? texteDuServeur(erreur)
              : t(`gestion.semaines.planification.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('gestion.semaines.planification.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('gestion.semaines.planification.creer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
