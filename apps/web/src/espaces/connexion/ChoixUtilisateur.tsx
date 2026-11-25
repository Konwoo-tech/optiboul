import { ErreurApi } from '@/api';
import type { Identification, PersonneDuPoste } from '@/auth/connexion.ts';
import { useTranslation } from '@/i18n';
import { AvatarUtilisateur } from '@/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './Connexion.module.css';
import { PavePin } from './PavePin.tsx';

/** Délai entre le 4ᵉ chiffre et la vérification : on voit les 4 pastilles se remplir. */
const DELAI_VERIFICATION_MS = 160;

type Props = {
  /** Les personnes à toucher : celles du poste de confiance (vrai serveur) ou du faux serveur. */
  utilisateurs: PersonneDuPoste[];
  identifier: (identification: Identification) => Promise<void>;
  /** Une personne est touchée : le message de déconnexion automatique peut disparaître. */
  onChoisi?: () => void;
};

/**
 * Connexion de poste « nom + code à 4 chiffres » (O1, US-010) : on touche son nom, puis on saisit
 * son code.
 * Rend un fragment : les blocs sont les enfants directs de la colonne de droite.
 */
export function ChoixUtilisateur({ utilisateurs, identifier, onChoisi }: Props) {
  const { t } = useTranslation();
  const [choisi, setChoisi] = useState<PersonneDuPoste | null>(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  // Vérification différée de 160 ms : annulée si on change de personne, quitte l'écran ou valide.
  const differee = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enCours = useRef(false);
  useEffect(() => () => clearTimeout(differee.current), []);

  const revenir = useCallback(() => {
    clearTimeout(differee.current);
    setChoisi(null);
    setCode('');
    setErreur('');
  }, []);

  const verifier = useCallback(
    async (saisi: string) => {
      clearTimeout(differee.current);
      if (!choisi || enCours.current) return;
      enCours.current = true;
      setOccupe(true);
      try {
        await identifier({ methode: 'code', utilisateur: choisi.id, code: saisi });
      } catch (e) {
        setErreur(
          e instanceof ErreurApi
            ? t(e.code === 'compte_bloque' ? 'connexion.compteBloque' : 'connexion.codeIncorrect')
            : t('erreur.injoignable'),
        );
        setCode('');
      } finally {
        enCours.current = false;
        setOccupe(false);
      }
    },
    [choisi, identifier, t],
  );

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
          onComplet={(saisi) => {
            clearTimeout(differee.current);
            differee.current = setTimeout(() => void verifier(saisi), DELAI_VERIFICATION_MS);
          }}
          onValider={(saisi) => void verifier(saisi)}
          onRetour={revenir}
        />
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
