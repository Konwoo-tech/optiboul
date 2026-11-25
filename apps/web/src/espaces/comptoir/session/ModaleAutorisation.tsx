import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useEffect, useRef, useState } from 'react';

import { codeErreur, type ActionsSession } from './api.ts';
import { formaterNombre } from './calculs.ts';
import styles from './Fenetres.module.css';
import type { DemandePlafond } from './types.ts';

type Props = {
  demande: DemandePlafond;
  actions: ActionsSession;
  onFermer: () => void;
  /** Le gérant ou le propriétaire a décidé : la fenêtre se ferme et l'écran en informe. */
  onDecision: (accord: boolean, demande: DemandePlafond) => void;
};

/** Le gérant de la semaine ou le propriétaire saisit son code sur ce poste pour décider. */
export function ModaleAutorisation({ demande, actions, onFermer, onDecision }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const { utilisateur } = useUtilisateurCourant();
  // Sur le poste de la caissière, le code est celui du gérant de la semaine ou du propriétaire (#316).
  const choisirLeValideur = utilisateur?.profil === 'caissier';
  const [valideur, setValideur] = useState<'gerant' | 'proprietaire'>('gerant');
  const champCode = useRef<HTMLInputElement>(null);
  // Comme la maquette (autoFocus) : on saisit le code sans toucher la souris.
  useEffect(() => champCode.current?.focus(), []);

  const decider = async (accord: boolean) => {
    try {
      const reponse = await actions.deciderAutorisation(
        demande.id,
        code,
        accord,
        choisirLeValideur ? valideur : undefined,
      );
      onDecision(accord, reponse.demande);
    } catch (e) {
      setErreur(
        codeErreur(e) === 'code_incorrect'
          ? t('comptoir.session.modales.autorisation.codeIncorrect')
          : t('comptoir.session.erreurs.defaut'),
      );
    }
  };

  return (
    <FenetreModale titre={t('comptoir.session.modales.autorisation.titre')} onFermer={onFermer}>
      <div className={styles.information}>
        {t('comptoir.session.modales.autorisation.info', {
          client: demande.clientNom,
          solde: formaterNombre(demande.soldeApres),
          plafond: formaterNombre(demande.plafond),
          par: demande.par,
          heure: demande.heure,
        })}
      </div>
      <div className={styles.aide}>{t('comptoir.session.modales.autorisation.aide')}</div>
      {choisirLeValideur && (
        <label className={styles.etiquette}>
          {t('comptoir.session.modales.autorisation.valideur')}
          <select
            className={styles.choixValideur}
            value={valideur}
            onChange={(e) => setValideur(e.target.value as 'gerant' | 'proprietaire')}
          >
            <option value="gerant">{t('comptoir.session.modales.autorisation.gerant')}</option>
            <option value="proprietaire">
              {t('comptoir.session.modales.autorisation.proprietaire')}
            </option>
          </select>
        </label>
      )}
      <label className={styles.etiquette}>
        {t('comptoir.session.modales.autorisation.code')}
        <input
          ref={champCode}
          type="password"
          className={styles.code}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
            setErreur('');
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void decider(true);
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
        />
        <span className={styles.erreurCode} role={erreur ? 'alert' : undefined}>
          {erreur}
        </span>
      </label>
      <div className={styles.boutons}>
        <button type="button" className={styles.discret} onClick={onFermer}>
          {t('comptoir.session.modales.autorisation.laisser')}
        </button>
        <button type="button" className={styles.refuser} onClick={() => void decider(false)}>
          {t('comptoir.session.modales.autorisation.refuser')}
        </button>
        <button type="button" className={styles.confirmer} onClick={() => void decider(true)}>
          {t('comptoir.session.modales.autorisation.autoriser')}
        </button>
      </div>
    </FenetreModale>
  );
}
