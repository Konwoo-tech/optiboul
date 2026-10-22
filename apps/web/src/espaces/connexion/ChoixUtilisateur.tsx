import { ErreurApi } from '@/api';
import { useTranslation } from '@/i18n';
import {
  CODE_DEMO,
  useUtilisateursSimules,
  type Identification,
  type UtilisateurSimule,
} from '@/simulation';
import { AvatarUtilisateur } from '@/ui';
import { useCallback, useState } from 'react';

import styles from './Connexion.module.css';
import { PavePin } from './PavePin.tsx';

/** Délai entre le 4ᵉ chiffre et la vérification : on voit les 4 pastilles se remplir. */
const DELAI_VERIFICATION_MS = 160;

type Props = {
  identifier: (identification: Identification) => Promise<void>;
  /** Une personne est touchée : le message de déconnexion automatique peut disparaître. */
  onChoisi?: () => void;
};

/**
 * Connexion de poste « nom + code à 4 chiffres » (O1, US-010), en simulation : on touche son nom,
 * puis on saisit son code. Le vrai backend n'expose pas encore cette connexion.
 * Rend un fragment : les blocs sont les enfants directs de la colonne de droite.
 */
export function ChoixUtilisateur({ identifier, onChoisi }: Props) {
  const { t } = useTranslation();
  const { data: utilisateurs } = useUtilisateursSimules();
  const [choisi, setChoisi] = useState<UtilisateurSimule | null>(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const revenir = useCallback(() => {
    setChoisi(null);
    setCode('');
    setErreur('');
  }, []);

  const verifier = useCallback(
    async (saisi: string) => {
      if (!choisi) return;
      setOccupe(true);
      try {
        await identifier({ methode: 'code', utilisateur: choisi.id, code: saisi });
      } catch (e) {
        setErreur(e instanceof ErreurApi ? t('connexion.codeIncorrect') : t('erreur.injoignable'));
        setCode('');
      } finally {
        setOccupe(false);
      }
    },
    [choisi, identifier, t],
  );

  if (!utilisateurs) return null;

  if (choisi) {
    return (
      <div className={styles.pin}>
        <button type="button" className={styles.retour} onClick={revenir}>
          {t('connexion.changerPersonne')}
        </button>
        <AvatarUtilisateur nom={choisi.nom} profil={choisi.profil} taille={72} />
        <div className={styles.identite}>
          <div className={styles.nomPin}>{choisi.nom}</div>
          <div className={styles.rolePin}>{t(`profils.${choisi.profil}`)}</div>
        </div>
        <PavePin
          code={code}
          erreur={erreur}
          occupe={occupe}
          onChange={(suivant) => {
            setCode(suivant);
            setErreur('');
          }}
          onComplet={(saisi) => setTimeout(() => void verifier(saisi), DELAI_VERIFICATION_MS)}
          onValider={(saisi) => void verifier(saisi)}
          onRetour={revenir}
        />
        <div className={styles.demo}>{t('connexion.codeDemo', { code: CODE_DEMO })}</div>
      </div>
    );
  }

  return (
    <>
      <div>
        <h1 className={styles.titre}>{t('connexion.quiEtesVous')}</h1>
        <p className={styles.sousTitre}>{t('connexion.quiEtesVousDetail')}</p>
      </div>
      <div className={styles.grille}>
        {utilisateurs.map((utilisateur) => (
          <button
            key={utilisateur.id}
            type="button"
            className={styles.carte}
            onClick={() => {
              onChoisi?.();
              setChoisi(utilisateur);
            }}
          >
            <AvatarUtilisateur nom={utilisateur.nom} profil={utilisateur.profil} />
            <span className={styles.textes}>
              <span className={styles.nomCarte}>{utilisateur.nom}</span>
              <span className={styles.roleCarte}>{t(`profils.${utilisateur.profil}`)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
