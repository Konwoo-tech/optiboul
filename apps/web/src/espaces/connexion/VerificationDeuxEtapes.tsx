import { ErreurApi } from '@/api';
import { useTranslation } from '@/i18n';
import {
  envoyerCodeOtp,
  texteDemo,
  verifierCodeOtp,
  type Canal,
  type ReponseIdentification,
} from '@/simulation';
import { AvatarUtilisateur, useToast } from '@/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './Etapes.module.css';

export type EnAttente = Extract<ReponseIdentification, { deuxFacteurs: true }>;

type Props = {
  attente: EnAttente;
  onRetour: () => void;
  /** Le code est bon : la session est ouverte. */
  onTermine: () => void;
};

const LONGUEUR_CODE = 6;
const DELAI_RENVOI_MS = 30_000;
const DELAI_VERIFICATION_MS = 150;

const NOM_CANAL: Record<Canal, string> = { sms: 'SMS', whatsapp: 'WhatsApp' };
const COULEUR_CANAL: Record<Canal, string> = { sms: '#F2B705', whatsapp: '#25D366' };

/** Double authentification par SMS ou WhatsApp (maquette, lignes 97-118). */
export function VerificationDeuxEtapes({ attente, onRetour, onTermine }: Props) {
  const { t, i18n } = useTranslation();
  const afficherToast = useToast();
  const champ = useRef<HTMLInputElement>(null);
  // Une seule requête à la fois, et la vérification différée de 150 ms s'annule (Entrée, bouton
  // Vérifier, Retour ou démontage) au lieu d'envoyer le code une deuxième fois.
  const enCours = useRef(false);
  const differee = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [canal, setCanal] = useState<Canal>('sms');
  const [envoye, setEnvoye] = useState(false);
  const [heure, setHeure] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [bloque, setBloque] = useState(false);
  const [renvoiPossibleA, setRenvoiPossibleA] = useState(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const secondes = Math.max(0, Math.ceil((renvoiPossibleA - maintenant) / 1000));

  // Décompte du renvoi : une mise à jour par seconde tant qu'il reste du temps.
  useEffect(() => {
    if (!envoye || renvoiPossibleA <= Date.now()) return;
    const minuterie = setInterval(() => {
      setMaintenant(Date.now());
      if (Date.now() >= renvoiPossibleA) clearInterval(minuterie);
    }, 1000);
    return () => clearInterval(minuterie);
  }, [envoye, renvoiPossibleA]);

  useEffect(() => {
    if (envoye) champ.current?.focus();
  }, [envoye]);

  useEffect(() => () => clearTimeout(differee.current), []);

  const envoyer = useCallback(
    async (choix: Canal) => {
      if (enCours.current) return;
      enCours.current = true;
      let heureEnvoi: string;
      try {
        heureEnvoi = await envoyerCodeOtp(choix);
      } finally {
        enCours.current = false;
      }
      setCanal(choix);
      setEnvoye(true);
      setHeure(heureEnvoi);
      setCode('');
      setErreur('');
      setBloque(false);
      setMaintenant(Date.now());
      setRenvoiPossibleA(Date.now() + DELAI_RENVOI_MS);
      afficherToast(t('connexion.toastEnvoye', { canal: NOM_CANAL[choix] }));
    },
    [afficherToast, t],
  );

  const verifier = useCallback(
    async (saisi: string) => {
      clearTimeout(differee.current);
      if (bloque || enCours.current) return;
      if (saisi.length < LONGUEUR_CODE) {
        setErreur(t('connexion.saisir6'));
        return;
      }
      enCours.current = true;
      try {
        await verifierCodeOtp(saisi);
        onTermine();
      } catch (e) {
        setCode('');
        const details = e instanceof ErreurApi ? (e.details as { essaisRestants?: number }) : {};
        if (e instanceof ErreurApi && e.code === 'trop_d_essais') {
          setBloque(true);
          setErreur(t('connexion.tropEssais'));
        } else {
          setErreur(t('connexion.codeFaux', { restants: details.essaisRestants ?? 0 }));
        }
      } finally {
        enCours.current = false;
      }
    },
    [bloque, onTermine, t],
  );

  const autre: Canal = canal === 'sms' ? 'whatsapp' : 'sms';
  const via =
    attente.via === 'code'
      ? t('connexion.viaCode')
      : attente.via === 'Google'
        ? t('connexion.viaGoogle', { email: attente.utilisateur.email })
        : t('connexion.viaEmail', { email: attente.utilisateur.email });
  const pret = code.length === LONGUEUR_CODE && !bloque;

  return (
    <div className={styles.otp}>
      <button
        type="button"
        className={styles.retour}
        onClick={() => {
          clearTimeout(differee.current);
          onRetour();
        }}
      >
        {t('connexion.retour')}
      </button>
      <div className={styles.otpEntete}>
        <AvatarUtilisateur
          nom={attente.utilisateur.nom}
          profil={attente.utilisateur.profil}
          taille={56}
        />
        <div style={{ minWidth: 0 }}>
          <div className={styles.otpTitre}>{t('connexion.otpTitre')}</div>
          <div className={styles.otpEtape}>
            {t('connexion.etape', { nom: attente.utilisateur.nom, via })}
          </div>
        </div>
      </div>
      <div className={styles.otpQuestion}>{t('connexion.otpOu')}</div>
      <div className={styles.canaux}>
        {(['sms', 'whatsapp'] as const).map((choix) => (
          <button
            key={choix}
            type="button"
            className={styles.canal}
            aria-pressed={canal === choix}
            onClick={() => (envoye && canal !== choix ? void envoyer(choix) : setCanal(choix))}
          >
            <span className={styles.canalNom}>
              <span className={styles.canalPoint} style={{ background: COULEUR_CANAL[choix] }} />
              {NOM_CANAL[choix]}
            </span>
            <span className={styles.canalTelephone}>{attente.telephoneMasque}</span>
          </button>
        ))}
      </div>
      {!envoye ? (
        <button
          type="button"
          className={styles.boutonPrincipal}
          onClick={() => void envoyer(canal)}
        >
          {t('connexion.envoyer', { canal: NOM_CANAL[canal] })}
        </button>
      ) : (
        <>
          <div className={styles.otpInfo}>
            {t('connexion.codeEnvoye', {
              canal: NOM_CANAL[canal],
              telephone: attente.telephoneMasque,
              heure,
            })}
          </div>
          <label className={styles.champCode}>
            {t('connexion.otpCode')}
            <input
              ref={champ}
              className={`${styles.saisieCode} ${erreur ? styles.saisieCodeErreur : ''}`}
              value={code}
              disabled={bloque}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LONGUEUR_CODE}
              placeholder="••••••"
              onChange={(e) => {
                const chiffres = e.target.value.replace(/\D/g, '').slice(0, LONGUEUR_CODE);
                setCode(chiffres);
                setErreur('');
                if (chiffres.length === LONGUEUR_CODE) {
                  clearTimeout(differee.current);
                  differee.current = setTimeout(
                    () => void verifier(chiffres),
                    DELAI_VERIFICATION_MS,
                  );
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void verifier(code);
                }
              }}
            />
          </label>
          <div className={styles.erreurChamp} role="alert">
            {erreur}
          </div>
          <button
            type="button"
            className={`${styles.boutonVerifier} ${pret ? styles.boutonVerifierPret : ''}`}
            onClick={() => void verifier(code)}
          >
            {t('connexion.otpVerifier')}
          </button>
          <div className={styles.otpActions}>
            <button
              type="button"
              className={styles.renvoyer}
              disabled={secondes > 0}
              onClick={() => void envoyer(canal)}
            >
              {secondes > 0 ? t('connexion.renvoyerDans', { secondes }) : t('connexion.renvoyer')}
            </button>
            <button type="button" className={styles.autreCanal} onClick={() => void envoyer(autre)}>
              {t('connexion.autreCanal', { canal: NOM_CANAL[autre] })}
            </button>
          </div>
        </>
      )}
      <div className={styles.otpDemo}>{texteDemo('otpDemo', i18n.language)}</div>
    </div>
  );
}
