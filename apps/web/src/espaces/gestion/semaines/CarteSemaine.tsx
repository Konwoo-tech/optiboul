import { useTranslation } from '@/i18n';
import { AVATARS, initiales } from '@/utils';
import type { TFunction } from 'i18next';
import { useId } from 'react';

import type { Profil } from '../../../profils.ts';
import { jourEtHeure, jourSemaine } from './affichage.ts';
import { Mot } from './Mot.tsx';
import {
  noteCloture,
  niveauDuStatut,
  peutAffecter,
  peutCloturer,
  raisonOuverture,
  type RaisonOuverture,
} from './regles.ts';
import styles from './Semaines.module.css';
import type { Cloture, Personne, RoleAffecte, Semaine } from './types.ts';

type Props = {
  semaine: Semaine;
  semaines: readonly Semaine[];
  profil: Profil;
  nom: string;
  gerants: readonly Personne[];
  responsables: readonly Personne[];
  cloture: Cloture | undefined;
  onAffecter: (role: RoleAffecte, personne: string) => void;
  onOuvrir: () => void;
  onCloturer: () => void;
};

type ChampEquipe = {
  role: RoleAffecte;
  libelle: string;
  valeur: Personne | null;
  options: readonly Personne[];
};

/** Gérant de la semaine ou responsable de production : une liste pour le propriétaire, sinon un nom. */
function Equipier({
  champ,
  modifiable,
  onChoisir,
}: {
  champ: ChampEquipe;
  modifiable: boolean;
  onChoisir: (personne: string) => void;
}) {
  const { t } = useTranslation();
  const idEtiquette = useId();
  return (
    <div className={styles.personne}>
      <span className={styles.etiquette} id={idEtiquette}>
        {champ.libelle}
      </span>
      {modifiable ? (
        <select
          className={styles.choix}
          aria-labelledby={idEtiquette}
          value={champ.valeur?.id ?? ''}
          onChange={(evenement) => onChoisir(evenement.target.value)}
        >
          <option value="">{t('gestion.semaines.carte.choisir')}</option>
          {champ.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nom}
            </option>
          ))}
        </select>
      ) : (
        <div className={styles.identite}>
          <span
            aria-hidden
            className={styles.pastille}
            style={{ background: champ.valeur ? AVATARS[champ.valeur.profil] : 'var(--ob-doux)' }}
          >
            {champ.valeur ? initiales(champ.valeur.nom) : '?'}
          </span>
          <span className={styles.nom}>
            {champ.valeur?.nom ?? t('gestion.semaines.carte.nonAffecte')}
          </span>
        </div>
      )}
    </div>
  );
}

/** Texte de ce qui empêche d'ouvrir la semaine. */
function texteDeLaRaison(raison: RaisonOuverture, t: TFunction) {
  return raison.cle === 'autreOuverte'
    ? t('gestion.semaines.raisons.autreOuverte', { numero: raison.numero })
    : t(`gestion.semaines.raisons.${raison.cle}`);
}

/** Carte de la semaine choisie : état, équipe, ouverture et clôture (maquette : `wk`). */
export function CarteSemaine({
  semaine,
  semaines,
  profil,
  nom,
  gerants,
  responsables,
  cloture,
  onAffecter,
  onOuvrir,
  onCloturer,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const controles = cloture?.controles ?? [];
  const modifiable = peutAffecter(profil, semaine);
  const raison = raisonOuverture(semaine, semaines, profil, nom);
  const peutOuvrir = semaine.statut === 'planifiee' && !raison;
  const peutFermer = peutCloturer(profil, semaine, nom, controles);
  const note = noteCloture(profil, semaine, nom, controles);

  const lignes = [
    [t('gestion.semaines.carte.planifieePar'), semaine.planifieePar || '—'],
    [
      t('gestion.semaines.carte.ouverte'),
      semaine.ouverture
        ? `${semaine.ouverture.par} · ${jourEtHeure(semaine.ouverture.jour, semaine.ouverture.heure, langue)}`
        : '—',
    ],
    [
      t('gestion.semaines.carte.cloturee'),
      semaine.cloture
        ? `${semaine.cloture.par} · ${jourEtHeure(semaine.cloture.jour, semaine.cloture.heure, langue)}`
        : '—',
    ],
  ] as const;

  return (
    <section
      className={`${styles.carte} ${styles.carteSemaine}`}
      aria-label={t('gestion.semaines.carte.titre', { numero: semaine.numero })}
    >
      <div className={styles.entete}>
        <div>
          <h2 className={styles.titreSemaine}>
            {t('gestion.semaines.carte.titre', { numero: semaine.numero })}
          </h2>
          <div className={styles.dates}>
            {t('gestion.semaines.carte.dates', {
              du: jourSemaine(semaine.du, langue),
              au: jourSemaine(semaine.au, langue),
            })}
          </div>
        </div>
        <Mot niveau={niveauDuStatut(semaine.statut)}>
          {t(`gestion.semaines.statuts.${semaine.statut}`)}
        </Mot>
      </div>

      <div className={styles.equipe}>
        <Equipier
          champ={{
            role: 'gerant',
            libelle: t('gestion.semaines.carte.gerant'),
            valeur: semaine.gerant,
            options: gerants,
          }}
          modifiable={modifiable}
          onChoisir={(id) => onAffecter('gerant', id)}
        />
        <Equipier
          champ={{
            role: 'production',
            libelle: t('gestion.semaines.carte.production'),
            valeur: semaine.production,
            options: responsables,
          }}
          modifiable={modifiable}
          onChoisir={(id) => onAffecter('production', id)}
        />
      </div>

      <dl className={styles.lignes}>
        {lignes.map(([libelle, valeur]) => (
          <div className={styles.ligne} key={libelle}>
            <dt className={styles.ligneLibelle}>{libelle}</dt>
            <dd className={styles.ligneValeur}>{valeur}</dd>
          </div>
        ))}
      </dl>

      {peutOuvrir && (
        <button type="button" className={styles.ouvrir} onClick={onOuvrir}>
          {t('gestion.semaines.carte.ouvrir', { numero: semaine.numero })}
        </button>
      )}
      {raison && <div className={styles.avis}>{texteDeLaRaison(raison, t)}</div>}

      {semaine.statut === 'ouverte' && (
        <>
          <button
            type="button"
            className={`${styles.cloturer} ${peutFermer ? '' : styles.cloturerBloque}`}
            aria-disabled={!peutFermer}
            onClick={() => {
              if (peutFermer) onCloturer();
            }}
          >
            {t('gestion.semaines.carte.cloturer', { numero: semaine.numero })}
          </button>
          <div className={styles.note}>
            {t(`gestion.semaines.notesCloture.${note}`, {
              gerant: semaine.gerant?.nom ?? '—',
              jour: jourSemaine(semaine.au, langue),
            })}
          </div>
        </>
      )}

      <div className={styles.regle}>{t('gestion.semaines.carte.regle')}</div>
    </section>
  );
}
