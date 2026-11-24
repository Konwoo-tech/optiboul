import { ErreurApi } from '@/api';
import { useTranslation } from '@/i18n';
import { LogoGoogle } from '@/ui';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import styles from './Etapes.module.css';

type Gis = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (r: { credential: string }) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

let chargement: Promise<Gis> | null = null;

/** Charge Google Identity Services une seule fois ; échoue hors ligne ou si l'adresse est bloquée. */
function chargerGoogle(): Promise<Gis> {
  chargement ??= new Promise<Gis>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: Gis }).google);
    script.onerror = () => {
      chargement = null;
      script.remove();
      reject(new Error('Google Identity Services injoignable'));
    };
    document.head.append(script);
  });
  return chargement;
}

type Props = {
  /** Identifiant OAuth public du serveur ; vide : seul le jeton de test local peut servir. */
  clientId: string;
  /** Local seulement : le serveur accepte un jeton « test:<gmail> » à la place de celui de Google. */
  testLocal: boolean;
  /** Envoie le jeton au serveur ; une erreur remonte ici pour s'afficher sous le bouton. */
  onJeton: (jeton: string) => Promise<void>;
};

/**
 * « Continuer avec Google » : le bouton officiel de Google Identity Services (identifiant OAuth du
 * serveur), ou, en local seulement, une saisie de Gmail qui envoie un jeton de test.
 */
export function BoutonGoogle({ clientId, testLocal, onJeton }: Props) {
  const { t, i18n } = useTranslation();
  const conteneur = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState('');
  const [gmail, setGmail] = useState('');
  const surJeton = useRef(onJeton);
  useEffect(() => {
    surJeton.current = onJeton;
  });

  const envoyer = async (jeton: string) => {
    setErreur('');
    try {
      await surJeton.current(jeton);
    } catch (e) {
      const code = e instanceof ErreurApi ? e.code : undefined;
      setErreur(
        code === 'compte_inconnu' || code === 'google_invalide'
          ? t('connexion.googleRefuse')
          : t('connexion.googleIndisponible'),
      );
    }
  };

  useEffect(() => {
    if (!clientId) return;
    let actif = true;
    chargerGoogle()
      .then((google) => {
        if (!actif || !conteneur.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => void envoyer(credential),
        });
        google.accounts.id.renderButton(conteneur.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 400,
          locale: i18n.language,
        });
      })
      .catch(() => actif && setErreur(t('connexion.googleIndisponible')));
    return () => {
      actif = false;
    };
    // `envoyer` ne change que par la langue de ses messages : le bouton n'est pas redessiné pour autant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, i18n.language]);

  if (!clientId && !testLocal) return null;

  return (
    <div className={styles.formulaire}>
      {clientId ? (
        <div ref={conteneur} />
      ) : (
        <form
          className={styles.formulaire}
          onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (gmail.trim()) void envoyer(`test:${gmail.trim()}`);
          }}
        >
          <label className={styles.champ}>
            {t('connexion.googleTestGmail')}
            <input
              className={styles.saisie}
              type="email"
              value={gmail}
              placeholder="nom@gmail.com"
              onChange={(e) => setGmail(e.target.value)}
            />
          </label>
          <button type="submit" className={styles.boutonGoogle}>
            <LogoGoogle />
            <span>{t('connexion.googleTest')}</span>
          </button>
        </form>
      )}
      <div className={styles.erreurChamp} role="alert">
        {erreur}
      </div>
    </div>
  );
}
