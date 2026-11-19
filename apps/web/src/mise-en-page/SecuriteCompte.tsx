import {
  ErreurApi,
  mfaCodesSecoursCreate,
  mfaList,
  mfaTotpActiverCreate,
  mfaTotpDesactiverCreate,
  mfaTotpPreparerCreate,
  type EtatMfa,
  type SecretTotp,
} from '@/api';
import { useTranslation } from '@/i18n';
import { FenetreModale, useToast } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';

import styles from '../espaces/comptoir/caisses/Fenetres.module.css';
import menu from './MiseEnPage.module.css';

const CLE = ['securite', 'mfa'] as const;

/** Le secret en groupes de quatre caractères, plus facile à recopier dans l'application. */
const groupesDe4 = (secret: string) =>
  secret
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();

/**
 * Sécurité du compte (US-012) : application d'authentification (TOTP, type Google Authenticator) et
 * codes de secours de la personne connectée. Les codes de secours ne sont montrés qu'une fois.
 */
function FenetreSecurite({ onFermer }: { onFermer: () => void }) {
  const { t } = useTranslation();
  const afficher = useToast();
  const client = useQueryClient();
  const etat = useQuery({
    queryKey: CLE,
    queryFn: async () => (await mfaList()).data as unknown as EtatMfa,
  });
  const [secret, setSecret] = useState<SecretTotp | null>(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const relire = () => client.invalidateQueries({ queryKey: CLE });

  const preparer = useMutation({
    mutationFn: async () => (await mfaTotpPreparerCreate()).data as SecretTotp,
    onSuccess: (donnees) => {
      setSecret(donnees);
      setCode('');
      setErreur(null);
    },
    onError: () => afficher(t('securite.erreur')),
  });
  const activer = useMutation({
    mutationFn: async (valeur: string) =>
      (await mfaTotpActiverCreate({ code: valeur })).data as unknown as { codesSecours: string[] },
    onSuccess: (donnees) => {
      setSecret(null);
      setCodes(donnees.codesSecours);
      afficher(t('securite.activee'));
      void relire();
    },
    onError: (e) =>
      setErreur(e instanceof ErreurApi && e.code === 'code_incorrect' ? 'incorrect' : 'defaut'),
  });
  const desactiver = useMutation({
    mutationFn: () => mfaTotpDesactiverCreate(),
    onSuccess: () => {
      setCodes(null);
      afficher(t('securite.desactivee'));
      void relire();
    },
    onError: () => afficher(t('securite.erreur')),
  });
  const regenerer = useMutation({
    mutationFn: async () =>
      (await mfaCodesSecoursCreate()).data as unknown as { codesSecours: string[] },
    onSuccess: (donnees) => {
      setCodes(donnees.codesSecours);
      void relire();
    },
    onError: () => afficher(t('securite.erreur')),
  });
  const occupe = [preparer, activer, desactiver, regenerer].some((m) => m.isPending);

  const envoyer = (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErreur('format');
      return;
    }
    activer.mutate(code);
  };

  return (
    <FenetreModale titre={t('securite.titre')} onFermer={onFermer}>
      <div className={styles.formulaire}>
        {etat.isLoading && <div className={styles.discret}>{t('securite.chargement')}</div>}
        {etat.isError && (
          <div className={styles.erreur} role="alert">
            {t('securite.erreur')}
          </div>
        )}
        {etat.data && (
          <div className={styles.creneauTitre}>
            {etat.data.totp
              ? t('securite.etatActif', { count: etat.data.codesSecoursRestants })
              : t('securite.etatInactif')}
          </div>
        )}

        {etat.data && !etat.data.totp && !secret && (
          <>
            <div className={styles.discret}>{t('securite.aide')}</div>
            <button
              type="button"
              className={styles.confirmer}
              disabled={occupe}
              onClick={() => preparer.mutate()}
            >
              {t('securite.activer')}
            </button>
          </>
        )}

        {secret && (
          <form className={styles.formulaire} onSubmit={envoyer} noValidate>
            <div className={styles.discret}>{t('securite.etapeCle')}</div>
            <div className={styles.creneauTitre} aria-label={t('securite.cle')}>
              {groupesDe4(secret.secret)}
            </div>
            <label className={styles.champ}>
              {t('securite.code')}
              <input
                className={styles.texte}
                value={code}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                aria-invalid={erreur ? true : undefined}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setErreur(null);
                }}
              />
            </label>
            {erreur && (
              <div className={styles.erreur} role="alert">
                {t(`securite.erreurs.${erreur}`)}
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.annuler} onClick={() => setSecret(null)}>
                {t('securite.annuler')}
              </button>
              <button type="submit" className={styles.confirmer} disabled={occupe}>
                {t('securite.confirmer')}
              </button>
            </div>
          </form>
        )}

        {codes && (
          <div className={styles.creneauTitre}>
            <strong>{t('securite.codesSecours')}</strong>
            <div>{codes.join(' · ')}</div>
            <div className={styles.discret}>{t('securite.codesUneFois')}</div>
          </div>
        )}

        {etat.data?.totp && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.annuler}
              disabled={occupe}
              onClick={() => regenerer.mutate()}
            >
              {t('securite.regenerer')}
            </button>
            <button
              type="button"
              className={styles.annuler}
              disabled={occupe}
              onClick={() => desactiver.mutate()}
            >
              {t('securite.desactiver')}
            </button>
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.confirmer} onClick={onFermer}>
            {t('securite.fermer')}
          </button>
        </div>
      </div>
    </FenetreModale>
  );
}

/** Bouton « Sécurité du compte » du menu, et sa fenêtre. */
export function SecuriteCompte({ libelle }: { libelle: string }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <button type="button" className={menu.changer} onClick={() => setOuverte(true)}>
        {libelle}
      </button>
      {ouverte && <FenetreSecurite onFermer={() => setOuverte(false)} />}
    </>
  );
}
