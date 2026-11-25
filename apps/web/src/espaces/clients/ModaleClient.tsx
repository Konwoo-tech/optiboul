import { useTranslation } from '@/i18n';
import { FenetreModale } from '@/ui';
import { useState, type SubmitEvent } from 'react';

import styles from '../comptoir/caisses/Fenetres.module.css';
import type { TypeClient } from './types.ts';

const TYPES_DE_CLIENT: readonly TypeClient[] = ['livreur', 'restaurant', 'hotel', 'particulier'];

/** Produits dont le client peut avoir un prix propre : code de l'API → libellé de l'interface. */
const PRODUITS_TARIFES = [
  { code: 'BAG', cle: 'clients.nouveau.prixBag' },
  { code: 'KO', cle: 'clients.nouveau.prixKo' },
  { code: 'GC135', cle: 'clients.nouveau.prixGc' },
] as const;

export type NouveauClient = {
  nom: string;
  type: TypeClient;
  lieu: string;
  telephone: string;
  /** Plafond propre en FCFA ; absent : le plafond commun. */
  plafond?: number;
  /** Code du produit → prix en FCFA, pour les seuls prix renseignés. */
  tarifs: Record<string, number>;
};

type Props = {
  envoiEnCours: boolean;
  /** Renvoie la clé du message d'erreur, ou `null` quand le client est créé. */
  onConfirmer: (client: NouveauClient) => Promise<string | null>;
  onFermer: () => void;
};

/** Le numéro des relances WhatsApp : vide, ou 9 chiffres commençant par 6 (comme le serveur). */
const telephoneValide = (valeur: string) => valeur === '' || /^6\d{8}$/.test(valeur);

/** Fiche d'un nouveau client : identité, plafond de dette et prix propres (gérant, propriétaire). */
export function ModaleClient({ envoiEnCours, onConfirmer, onFermer }: Props) {
  const { t } = useTranslation();
  const [nom, setNom] = useState('');
  const [type, setType] = useState<TypeClient>('livreur');
  const [lieu, setLieu] = useState('');
  const [telephone, setTelephone] = useState('');
  const [plafond, setPlafond] = useState('');
  const [prix, setPrix] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!nom.trim()) return setErreur('nom');
    if (!telephoneValide(telephone)) return setErreur('telephone');
    const tarifs: Record<string, number> = {};
    for (const { code } of PRODUITS_TARIFES) {
      if (prix[code]) tarifs[code] = Number(prix[code]);
    }
    const refus = await onConfirmer({
      nom: nom.trim(),
      type,
      lieu: lieu.trim(),
      telephone,
      ...(plafond ? { plafond: Number(plafond) } : {}),
      tarifs,
    });
    if (refus) setErreur(refus);
  };

  const chiffres = (valeur: string) => valeur.replace(/\D/g, '');

  return (
    <FenetreModale titre={t('clients.nouveau.titre')} onFermer={onFermer}>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        <label className={styles.champ}>
          {t('clients.nouveau.nom')}
          <input
            className={styles.texte}
            value={nom}
            maxLength={150}
            onChange={(e) => {
              setNom(e.target.value);
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('clients.nouveau.type')}
          <select
            className={styles.texte}
            value={type}
            onChange={(e) => setType(e.target.value as TypeClient)}
          >
            {TYPES_DE_CLIENT.map((cle) => (
              <option key={cle} value={cle}>
                {t(`clients.types.${cle}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.champ}>
          {t('clients.nouveau.lieu')}
          <input
            className={styles.texte}
            value={lieu}
            maxLength={150}
            onChange={(e) => setLieu(e.target.value)}
          />
        </label>
        <label className={styles.champ}>
          {t('clients.nouveau.telephone')}
          <input
            className={styles.texte}
            value={telephone}
            inputMode="tel"
            maxLength={9}
            onChange={(e) => {
              setTelephone(chiffres(e.target.value));
              setErreur(null);
            }}
          />
        </label>
        <label className={styles.champ}>
          {t('clients.nouveau.plafond')}
          <input
            className={styles.texte}
            value={plafond}
            inputMode="numeric"
            onChange={(e) => setPlafond(chiffres(e.target.value))}
          />
        </label>
        <div className={styles.discret}>{t('clients.nouveau.noteTarifs')}</div>
        {PRODUITS_TARIFES.map(({ code, cle }) => (
          <label key={code} className={styles.champ}>
            {t(cle)}
            <input
              className={styles.texte}
              value={prix[code] ?? ''}
              inputMode="numeric"
              onChange={(e) =>
                setPrix((actuels) => ({ ...actuels, [code]: chiffres(e.target.value) }))
              }
            />
          </label>
        ))}
        {erreur && (
          <div className={styles.erreur} role="alert">
            {t(`clients.nouveau.erreurs.${erreur}`)}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.annuler} onClick={onFermer}>
            {t('clients.nouveau.annuler')}
          </button>
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {t('clients.nouveau.creer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
