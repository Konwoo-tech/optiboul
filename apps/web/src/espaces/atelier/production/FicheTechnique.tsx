import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast } from '@/ui';
import { formaterNombre } from '@/utils';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import type { Ecran } from '../../../navigation.ts';
import { codeErreur, useFiches, useModifierFiche } from './api.ts';
import { dateCourte } from './affichage.ts';
import styles from './Fiche.module.css';
import {
  calculerFiche,
  champInvalide,
  decimal,
  nombreSaisi,
} from './regles.ts';
import { INGREDIENTS, type FicheProduit, type Ingredient, type Recette } from './types.ts';

type Props = {
  ecran: Ecran;
  /** Identifiant de la fiche ouverte (`?fiche=`). */
  ficheId: string;
  utilisateur: string;
  peutModifier: boolean;
  /** Le chef de production lit la fiche comme référence de pétrissage. */
  estChef: boolean;
  /** Chemin de l'écran de production, où mène « Retour ». */
  cheminRetour: string;
};

type ChampRecette = 'boule' | 'pb' | Ingredient;
type Brouillon = Record<ChampRecette, string>;

const UNITES: Record<Ingredient, 'kg' | 'L' | 'sachets'> = {
  farine: 'kg',
  eau: 'L',
  sel: 'kg',
  levure: 'kg',
  ameliorant: 'kg',
  glace: 'sachets',
};

const brouillonDe = (recette: Recette, langue: string): Brouillon =>
  Object.fromEntries(
    (['boule', 'pb', ...INGREDIENTS] as const).map((cle) => [
      cle,
      langue === 'en' ? String(recette[cle]) : String(recette[cle]).replace('.', ','),
    ]),
  ) as Brouillon;

const recetteDe = (brouillon: Brouillon): Recette =>
  Object.fromEntries(
    (['boule', 'pb', ...INGREDIENTS] as const).map((cle) => [cle, nombreSaisi(brouillon[cle])]),
  ) as Recette;

/**
 * Fiche technique d'un produit (cahier des charges §5.5) : ingrédients d'un sac de 50 kg, coût de
 * revient par pain, marge, rendement et procédé. Le propriétaire la modifie : chaque enregistrement
 * crée une version. Les autres profils la consultent.
 */
export function FicheTechnique({
  ecran,
  ficheId,
  utilisateur,
  peutModifier,
  estChef,
  cheminRetour,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const afficher = useToast();
  const navigate = useNavigate();
  const requete = useFiches(utilisateur);
  const modifier = useModifierFiche(utilisateur);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const champs = useRef<Partial<Record<ChampRecette, HTMLInputElement | null>>>({});

  const donnees = requete.data;
  if (!donnees) {
    return (
      <>
        <EnTeteEcran ecran={ecran} titre={t('atelier.production.fiche.titre')} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('atelier.production.fiche.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const fiche: FicheProduit = donnees.fiches.find((f) => f.id === ficheId) ?? donnees.fiches[0]!;
  const edition = brouillon !== null;
  const recette = brouillon ? recetteDe(brouillon) : fiche.recette;
  const calcul = calculerFiche(recette, donnees.prix, fiche.prix);
  const tf = (cle: string, options?: Record<string, unknown>) =>
    t(`atelier.production.fiche.${cle}`, options);
  const dec = (valeur: number, chiffres: number) => decimal(valeur, chiffres, langue);
  const signe = (valeur: number) =>
    `${valeur > 0 ? '+' : valeur < 0 ? '−' : ''}${dec(Math.abs(valeur), 1)}`;
  const nomProduit = langue === 'en' ? fiche.nomEn : fiche.nom;

  const choisir = (id: string) => {
    setBrouillon(null);
    setErreur(null);
    void navigate(`${cheminRetour}?fiche=${id}`, { replace: true });
  };

  const saisir =
    (cle: ChampRecette, entier: boolean) => (evenement: ChangeEvent<HTMLInputElement>) => {
      const texte = evenement.target.value.replace(entier ? /\D/g : /[^\d.,]/g, '');
      setErreur(null);
      setBrouillon((avant) => (avant ? { ...avant, [cle]: texte } : avant));
    };

  const enregistrer = () => {
    if (!brouillon) return;
    const saisie = recetteDe(brouillon);
    const faute = champInvalide(saisie);
    if (faute) {
      setErreur(tf('erreurQuantites'));
      // Le focus va au premier champ à corriger, pour qu'on n'ait pas à le chercher.
      champs.current[faute as ChampRecette]?.focus();
      return;
    }
    modifier.mutate(
      { id: fiche.id, recette: { ...saisie, pb: Math.round(saisie.pb) } },
      {
        onSuccess: (reponse) => {
          const apres = reponse.fiches.find((f) => f.id === fiche.id);
          setBrouillon(null);
          setErreur(null);
          afficher(tf('toastEnregistree', { code: fiche.code, version: apres?.version ?? '' }));
        },
        onError: (e) =>
          setErreur(codeErreur(e) === 'quantites_invalides' ? tf('erreurQuantites') : tf('erreurEnregistrement')),
      },
    );
  };

  const prix = fiche.prix;
  const marges = calcul.marges;
  const indicateurs = [
    {
      cle: 'cout',
      valeur: `${dec(calcul.coutParPain, 1)} FCFA`,
      sous: tf('kpi.coutSous'),
      couleur: 'var(--ob-encre)',
    },
    {
      cle: 'prix',
      valeur: prix ? `${prix[0] === prix[1] ? prix[0] : `${prix[0]} / ${prix[1]}`} FCFA` : '—',
      sous: tf(prix ? 'kpi.prixSous' : 'kpi.prixAucun'),
      couleur: 'var(--ob-encre)',
    },
    {
      cle: 'marge',
      valeur: marges
        ? `${marges[0] === marges[1] ? signe(marges[0]) : `${signe(marges[0])} / ${signe(marges[1])}`} FCFA`
        : '—',
      sous: tf(marges && marges[0] < 0 ? 'kpi.margePerte' : 'kpi.margeSous'),
      couleur: marges
        ? marges[0] < 0
          ? 'var(--ob-bloquant-texte)'
          : 'var(--ob-ok-texte)'
        : 'var(--ob-encre)',
    },
    {
      cle: 'octobre',
      valeur: formaterNombre(fiche.produitsOctobre),
      sous: tf('kpi.octobreSous'),
      couleur: 'var(--ob-encre)',
    },
  ];

  const totaux = [
    {
      libelle: tf('totaux.matieres'),
      valeur: `${formaterNombre(Math.round(calcul.matieres))} FCFA`,
      taille: '14px',
      graisse: '500',
      fond: 'transparent',
    },
    {
      libelle: tf('totaux.cuisson', { sacs: 8 }),
      valeur: `${formaterNombre(Math.round(calcul.cuisson))} FCFA`,
      taille: '14px',
      graisse: '500',
      fond: 'transparent',
    },
    {
      libelle: tf('totaux.sac'),
      valeur: `${formaterNombre(Math.round(calcul.coutDuSac))} FCFA`,
      taille: '14px',
      graisse: '800',
      fond: 'transparent',
    },
    {
      libelle: tf('totaux.pain', {
        sac: formaterNombre(calcul.coutDuSac > 0 ? Math.round(calcul.coutDuSac) : 0),
        pains: calcul.painsParSac,
      }),
      valeur: `${dec(calcul.coutParPain, 1)} FCFA`,
      taille: '16px',
      graisse: '800',
      fond: 'var(--ob-champ)',
    },
  ];

  const pains = Math.max(1, Math.round(recette.pb));
  const rendements: Array<{
    cle: string;
    libelle: string;
    valeur: string;
    champ?: ChampRecette;
    unite?: string;
    grand?: boolean;
  }> = [
    { cle: 'pate', libelle: tf('rendement.pate'), valeur: `${dec(calcul.pate, 2)} kg` },
    {
      cle: 'boule',
      libelle: tf('rendement.boule'),
      valeur: `${formaterNombre(Math.round(recette.boule))} g`,
      champ: 'boule',
      unite: 'g',
    },
    { cle: 'pb', libelle: tf('rendement.pb'), valeur: String(pains), champ: 'pb', unite: '' },
    { cle: 'piece', libelle: tf('rendement.piece'), valeur: `${dec(calcul.piece, 1)} g` },
    { cle: 'boulesParSac', libelle: tf('rendement.boulesParSac'), valeur: dec(calcul.boulesParSac, 2) },
    {
      cle: 'painsParSac',
      libelle: tf('rendement.painsParSac'),
      valeur: formaterNombre(calcul.painsParSac),
      grand: true,
    },
  ];

  const etapes = (['petrissage', 'pointage', 'division', 'appret', 'cuisson'] as const).map(
    (cle, i) => ({
      numero: String(i + 1),
      nom: tf(`procede.${cle}.nom`),
      detail: tf(`procede.${cle}.detail`, {
        boule: formaterNombre(Math.round(recette.boule)),
        pieces: pains,
        poids: dec(calcul.piece, 0),
        minutes: fiche.cuisson,
      }),
    }),
  );

  const modifieLe =
    dateCourte(fiche.modifieLe, langue) + (fiche.modifieA ? ` · ${fiche.modifieA}` : '');
  const retourLibelle = tf('retour');

  return (
    <>
      <EnTeteEcran ecran={ecran} titre={t('atelier.production.fiche.titre')} />
      <div className={styles.page}>
        <div className={styles.barre}>
          <Link className={styles.retour} to={cheminRetour}>
            {retourLibelle}
          </Link>
          <div role="group" aria-label={tf('produits')} style={{ display: 'contents' }}>
            {donnees.fiches.map((f) => (
              <button
                type="button"
                key={f.id}
                className={`${styles.puce} ${f.id === fiche.id ? styles.puceActive : ''}`}
                aria-pressed={f.id === fiche.id}
                onClick={() => choisir(f.id)}
              >
                {f.code}
              </button>
            ))}
          </div>
        </div>

        <section className={styles.entete} aria-labelledby="titre-fiche">
          <div className={styles.identite}>
            <div className={styles.code} aria-hidden>
              {fiche.code}
            </div>
            <div className={styles.noms}>
              <h2 className={styles.nom} id="titre-fiche">
                {nomProduit}
              </h2>
              <div className={styles.version}>
                {tf('version', { version: fiche.version, date: modifieLe, par: fiche.modifiePar })}
              </div>
            </div>
          </div>
          <div className={styles.boutons}>
            {peutModifier && !edition && (
              <button
                type="button"
                className={styles.modifier}
                onClick={() => {
                  setErreur(null);
                  setBrouillon(brouillonDe(fiche.recette, langue));
                }}
              >
                {tf('modifier')}
              </button>
            )}
            {edition && (
              <>
                <button
                  type="button"
                  className={styles.annuler}
                  onClick={() => {
                    setBrouillon(null);
                    setErreur(null);
                  }}
                >
                  {tf('annuler')}
                </button>
                <button
                  type="button"
                  className={styles.enregistrer}
                  disabled={modifier.isPending}
                  onClick={enregistrer}
                >
                  {tf('enregistrer', { version: fiche.version + 1 })}
                </button>
              </>
            )}
          </div>
        </section>

        {erreur && (
          <p className={styles.erreur} role="alert">
            {erreur}
          </p>
        )}

        <ul className={styles.indicateurs}>
          {indicateurs.map((k) => (
            <li className={styles.indicateur} key={k.cle}>
              <span className={styles.indicateurLibelle}>{tf(`kpi.${k.cle}`)}</span>
              <span className={styles.indicateurValeur} style={{ color: k.couleur }}>
                {k.valeur}
              </span>
              <span className={styles.indicateurSous}>{k.sous}</span>
            </li>
          ))}
        </ul>

        <div className={styles.colonnes}>
          <section className={styles.carte} aria-labelledby="titre-ingredients">
            <div className={styles.carteIngredients}>
              <h3 className={`${styles.titre} ${styles.titreIngredients}`} id="titre-ingredients">
                {tf('ingredients.titre')}
              </h3>
              <div className={styles.sousTitre}>{tf('ingredients.sous')}</div>
              <div role="table" aria-labelledby="titre-ingredients">
                <div className={`${styles.grille} ${styles.titresGrille}`} role="row">
                  <span role="columnheader">{tf('ingredients.colIngredient')}</span>
                  <span className={styles.droite} role="columnheader">
                    {tf('ingredients.colQuantite')}
                  </span>
                  <span className={styles.droite} role="columnheader">
                    {tf('ingredients.colPourcent')}
                  </span>
                  <span className={styles.droite} role="columnheader">
                    {tf('ingredients.colPrix')}
                  </span>
                  <span className={styles.droite} role="columnheader">
                    {tf('ingredients.colCout')}
                  </span>
                </div>
                {calcul.lignes.map((ligne) => {
                  const unite = tf(`unites.${UNITES[ligne.ingredient]}`);
                  const farine = recette.farine || 1;
                  return (
                    <div
                      className={`${styles.grille} ${styles.ligneIngredient}`}
                      role="row"
                      key={ligne.ingredient}
                    >
                      <span className={styles.ingredient} role="rowheader">
                        {tf(`ingredients.noms.${ligne.ingredient}`)}
                      </span>
                      {edition ? (
                        <span className={styles.saisie} role="cell">
                          <input
                            ref={(element) => {
                              champs.current[ligne.ingredient] = element;
                            }}
                            className={styles.champ}
                            value={brouillon[ligne.ingredient]}
                            onChange={saisir(ligne.ingredient, false)}
                            inputMode="decimal"
                            aria-label={`${tf(`ingredients.noms.${ligne.ingredient}`)} (${unite})`}
                          />
                          <span className={styles.uniteChamp}>{unite}</span>
                        </span>
                      ) : (
                        <span className={styles.droite} role="cell">
                          {dec(ligne.quantite, 2)} {unite}
                        </span>
                      )}
                      <span className={`${styles.droite} ${styles.discret}`} role="cell">
                        {ligne.ingredient === 'glace'
                          ? '—'
                          : `${dec((ligne.quantite / farine) * 100, 1)} %`}
                      </span>
                      <span className={`${styles.droite} ${styles.discret}`} role="cell">
                        {ligne.prixUnitaire ? `${dec(ligne.prixUnitaire, 1)} / ${unite}` : '—'}
                      </span>
                      <span className={`${styles.droite} ${styles.gras}`} role="cell">
                        {ligne.prixUnitaire
                          ? formaterNombre(Math.round(ligne.quantite * ligne.prixUnitaire))
                          : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <ul className={styles.totaux}>
                {totaux.map((total) => (
                  <li
                    className={styles.total}
                    key={total.libelle}
                    style={{ fontSize: total.taille, fontWeight: total.graisse, background: total.fond }}
                  >
                    <span>{total.libelle}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{total.valeur}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <div className={styles.droiteColonne}>
            <section className={styles.carteTexte} aria-labelledby="titre-rendement">
              <h3 className={`${styles.titre} ${styles.titreRendement}`} id="titre-rendement">
                {tf('rendement.titre')}
              </h3>
              <ul className={styles.rendements}>
                {rendements.map((r) => (
                  <li className={styles.rendement} key={r.cle}>
                    <span>{r.libelle}</span>
                    {edition && r.champ ? (
                      <span className={styles.rendementSaisie}>
                        <input
                          ref={(element) => {
                            champs.current[r.champ!] = element;
                          }}
                          className={styles.champ}
                          value={brouillon[r.champ]}
                          onChange={saisir(r.champ, true)}
                          inputMode="numeric"
                          aria-label={r.libelle}
                        />
                        <span className={styles.uniteRendement}>{r.unite}</span>
                      </span>
                    ) : (
                      <span
                        className={styles.rendementValeur}
                        style={{
                          fontSize: r.grand ? '24px' : '15px',
                          color: r.grand ? 'var(--ob-marque)' : 'var(--ob-encre)',
                        }}
                      >
                        {r.valeur}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <section className={`${styles.carteTexte} ${styles.carteProcede}`} aria-labelledby="titre-procede">
              <div className={styles.entetesProcede}>
                <h3 className={styles.titre} id="titre-procede">
                  {tf('procede.titre')}
                </h3>
                <div className={styles.sousTitreProcede}>{tf('procede.sous')}</div>
              </div>
              <ol className={styles.procede}>
                {etapes.map((etape) => (
                  <li className={styles.etape} key={etape.numero}>
                    <span className={styles.numero} aria-hidden>
                      {etape.numero}
                    </span>
                    <div className={styles.etapeTexte}>
                      <span className={styles.etapeNom}>{etape.nom}</span>
                      <span className={styles.etapeDetail}>{etape.detail}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
        <p className={styles.regle}>
          {peutModifier
            ? tf('regleModifiable')
            : `${tf('regleLecture')}${estChef ? ` ${tf('regleChef')}` : ''}`}
        </p>
      </div>
    </>
  );
}
