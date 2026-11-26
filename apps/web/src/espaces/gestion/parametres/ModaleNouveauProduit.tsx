import { useTranslation } from '@/i18n';
import { FenetreModale, estTexteDuServeur, texteDuServeur } from '@/ui';
import { formaterNombre } from '@/utils';
import { useState, type SubmitEvent } from 'react';

import { calculerFiche, champInvalide } from '../../atelier/production/regles.ts';
import type { Recette } from '../../atelier/production/types.ts';
import styles from '../../comptoir/caisses/Fenetres.module.css';
import assistant from './NouveauProduit.module.css';

export type NouveauProduit = {
  code: string;
  nom: string;
  nomEn: string;
  /** Prix de vente de base en FCFA ; `null` : aucun. */
  prix: number | null;
  cuisson: number | null;
};

type Props = {
  /** Prix du jour de chaque matière (par sac pour la farine, par kg pour le reste), pour le coût. */
  prix: Parameters<typeof calculerFiche>[1];
  envoiEnCours: boolean;
  /** Le produit existe déjà côté serveur (la recette a échoué) : on ne le recrée pas. */
  produitCree: boolean;
  /** Renvoie la clé ou le texte du refus, ou `null` quand le produit et sa recette sont créés. */
  onConfirmer: (produit: NouveauProduit, recette: Recette) => Promise<string | null>;
  onFermer: () => void;
};

/** Recette de départ : une baguette (hydratation 60 %, sel 2 %, levure 1 %) que le boulanger ajuste. */
const RECETTE_DE_DEPART = {
  boule: '5000',
  pb: '20',
  farine: '50',
  eau: '30',
  sel: '1',
  levure: '0,5',
  ameliorant: '0,25',
  glace: '0',
} as const;

type ChampRecette = keyof typeof RECETTE_DE_DEPART;

const CHAMPS_RECETTE: { cle: ChampRecette; unite: 'g' | 'kg' | 'L' | 'sachets' | 'pains' }[] = [
  { cle: 'farine', unite: 'kg' },
  { cle: 'eau', unite: 'L' },
  { cle: 'sel', unite: 'kg' },
  { cle: 'levure', unite: 'kg' },
  { cle: 'ameliorant', unite: 'kg' },
  { cle: 'glace', unite: 'sachets' },
];

const nombre = (texte: string) => Number(texte.replace(',', '.'));
const decimal = (valeur: string) => valeur.replace(/[^\d.,]/g, '');
const chiffres = (valeur: string) => valeur.replace(/\D/g, '');

/**
 * Nouveau produit en deux temps : d'abord le produit (code, noms, prix de vente, cuisson), puis sa
 * recette pour un sac de 50 kg de farine, avec le coût de revient et la marge calculés en direct.
 * Sans recette, un produit n'apparaît ni dans le plan de production ni dans les fiches.
 */
export function ModaleNouveauProduit({
  prix,
  envoiEnCours,
  produitCree,
  onConfirmer,
  onFermer,
}: Props) {
  const { t } = useTranslation();
  const tp = (cle: string, options?: Record<string, unknown>) =>
    t(`gestion.parametres.produits.nouveau.${cle}`, options);
  const [etape, setEtape] = useState<1 | 2>(produitCree ? 2 : 1);
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [nomEn, setNomEn] = useState('');
  const [prixVente, setPrixVente] = useState('');
  const [cuisson, setCuisson] = useState('');
  const [recette, setRecette] = useState<Record<ChampRecette, string>>({ ...RECETTE_DE_DEPART });
  const [erreur, setErreur] = useState<string | null>(null);

  const valeursRecette = Object.fromEntries(
    Object.entries(recette).map(([cle, texte]) => [cle, nombre(texte)]),
  ) as unknown as Recette;
  const calcul = calculerFiche(
    valeursRecette,
    prix,
    nombre(prixVente) > 0 ? [nombre(prixVente), nombre(prixVente)] : null,
  );
  const recetteInvalide = champInvalide(valeursRecette as unknown as Record<string, number>);

  const suivant = () => {
    if (!/^[A-Za-z0-9]{1,10}$/.test(code)) return setErreur('code');
    if (!nom.trim()) return setErreur('nom');
    setErreur(null);
    setEtape(2);
  };

  const envoyer = async (evenement: SubmitEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (etape === 1) return suivant();
    if (recetteInvalide) return setErreur('recette');
    const refus = await onConfirmer(
      {
        code: code.toUpperCase(),
        nom: nom.trim(),
        nomEn: nomEn.trim(),
        prix: prixVente === '' ? null : Number(prixVente),
        cuisson: cuisson === '' ? null : Number(cuisson),
      },
      valeursRecette,
    );
    if (refus) {
      // Un code déjà pris ramène à la première étape, où il se corrige.
      if (refus === 'codeExiste') setEtape(1);
      setErreur(refus);
    }
  };

  const message = !erreur
    ? ''
    : estTexteDuServeur(erreur)
      ? texteDuServeur(erreur)
      : tp(`erreurs.${erreur}`);
  const marge = calcul.marges?.[0];

  return (
    <FenetreModale titre={tp('titre')} onFermer={onFermer}>
      <ol className={assistant.etapes} aria-label={tp('etapes')}>
        {[1, 2].map((n) => (
          <li
            key={n}
            className={`${assistant.etape} ${etape === n ? assistant.etapeActive : ''}`}
            aria-current={etape === n ? 'step' : undefined}
          >
            <span className={assistant.numero}>{n}</span>
            {tp(n === 1 ? 'etapeProduit' : 'etapeRecette')}
          </li>
        ))}
      </ol>
      <form className={styles.formulaire} onSubmit={(e) => void envoyer(e)} noValidate>
        {etape === 1 && (
          <>
            <label className={styles.champ}>
              {tp('code')}
              <input
                className={styles.texte}
                value={code}
                maxLength={10}
                autoCapitalize="characters"
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  setErreur(null);
                }}
              />
            </label>
            <div className={styles.discret}>{tp('noteCode')}</div>
            <label className={styles.champ}>
              {tp('nom')}
              <input
                className={styles.texte}
                value={nom}
                maxLength={100}
                onChange={(e) => {
                  setNom(e.target.value);
                  setErreur(null);
                }}
              />
            </label>
            <label className={styles.champ}>
              {tp('nomEn')}
              <input
                className={styles.texte}
                value={nomEn}
                maxLength={100}
                onChange={(e) => setNomEn(e.target.value)}
              />
            </label>
            <label className={styles.champ}>
              {tp('prix')}
              <input
                className={styles.texte}
                value={prixVente}
                inputMode="numeric"
                onChange={(e) => setPrixVente(chiffres(e.target.value))}
              />
            </label>
            <label className={styles.champ}>
              {tp('cuisson')}
              <input
                className={styles.texte}
                value={cuisson}
                inputMode="numeric"
                onChange={(e) => setCuisson(chiffres(e.target.value))}
              />
            </label>
          </>
        )}
        {etape === 2 && (
          <>
            <div className={styles.discret}>
              {produitCree ? tp('produitCree') : tp('noteRecette', { code, nom })}
            </div>
            <div className={assistant.grille}>
              <label className={styles.champ}>
                {tp('boule')}
                <div className={assistant.avecUnite}>
                  <input
                    className={styles.texte}
                    value={recette.boule}
                    inputMode="numeric"
                    onChange={(e) => setRecette((r) => ({ ...r, boule: chiffres(e.target.value) }))}
                  />
                  <span>g</span>
                </div>
              </label>
              <label className={styles.champ}>
                {tp('painsParBoule')}
                <div className={assistant.avecUnite}>
                  <input
                    className={styles.texte}
                    value={recette.pb}
                    inputMode="numeric"
                    onChange={(e) => setRecette((r) => ({ ...r, pb: chiffres(e.target.value) }))}
                  />
                  <span>{tp('pains')}</span>
                </div>
              </label>
              {CHAMPS_RECETTE.map(({ cle, unite }) => (
                <label className={styles.champ} key={cle}>
                  {t(`atelier.production.fiche.ingredients.noms.${cle}`)}
                  <div className={assistant.avecUnite}>
                    <input
                      className={styles.texte}
                      value={recette[cle]}
                      inputMode="decimal"
                      onChange={(e) =>
                        setRecette((r) => ({ ...r, [cle]: decimal(e.target.value) }))
                      }
                    />
                    <span>{t(`atelier.production.fiche.unites.${unite}`)}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className={assistant.recap} aria-live="polite">
              <div>
                <b>{formaterNombre(calcul.painsParSac)}</b> {tp('recapPains')}
              </div>
              <div>{tp('recapPate', { kg: formaterNombre(calcul.pate) })}</div>
              <div>{tp('recapCout', { cout: formaterNombre(Math.round(calcul.coutParPain)) })}</div>
              {marge !== undefined && (
                <div className={marge < 0 ? assistant.perte : assistant.gain}>
                  {tp('recapMarge', { marge: formaterNombre(Math.round(marge)) })}
                </div>
              )}
            </div>
          </>
        )}
        {message && (
          <div className={styles.erreur} role="alert">
            {message}
          </div>
        )}
        <div className={styles.actions}>
          {etape === 2 && !produitCree ? (
            <button type="button" className={styles.annuler} onClick={() => setEtape(1)}>
              {tp('retour')}
            </button>
          ) : (
            <button type="button" className={styles.annuler} onClick={onFermer}>
              {tp('annuler')}
            </button>
          )}
          <button type="submit" className={styles.confirmer} disabled={envoiEnCours}>
            {etape === 1 ? tp('suivant') : tp(produitCree ? 'reessayer' : 'creer')}
          </button>
        </div>
      </form>
    </FenetreModale>
  );
}
