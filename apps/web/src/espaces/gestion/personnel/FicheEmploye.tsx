import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useId, useRef, useState } from 'react';

import { jourMois } from '../semaines/affichage.ts';
import { moisPrecedent } from './affichage.ts';
import { ouvrirLeBulletin } from './api.ts';
import { AbsencesAvances } from './AbsencesAvances.tsx';
import { Mot } from './Mot.tsx';
import styles from './Personnel.module.css';
import {
  calculerPaie,
  erreurAjustement,
  estModifiable,
  paiementOuvert,
  type DroitsPaie,
  type ErreurAjustement,
} from './regles.ts';
import {
  MODES_PAIEMENT,
  type Employe,
  type InstantanePaie,
  type ModePaiement,
  type NouvelAjustement,
  type TypeAjustement,
} from './types.ts';

const fmt = formaterNombre;

type Props = {
  instantane: InstantanePaie;
  employe: Employe;
  droits: DroitsPaie;
  occupe: boolean;
  /** Erreur du serveur à afficher sous le formulaire (code), effacée dès qu'on saisit. */
  erreurServeur: string | null;
  mode: ModePaiement;
  montantPaye: string;
  onMode: (mode: ModePaiement) => void;
  reference: string;
  /** Le mobile money a été demandé sans référence : on le dit sous le champ. */
  referenceManquante: boolean;
  onReference: (reference: string) => void;
  onMontantPaye: (montant: string) => void;
  onAjouter: (ligne: Omit<NouvelAjustement, 'employe'>) => Promise<boolean>;
  onRetirer: (id: string) => void;
  /** Vrai serveur : enregistre les absences et les avances de la ligne. */
  onRetenues: (absences: number, avances: number) => void;
  onPayer: () => void;
  onModifier: () => void;
};

/** Fiche de l'employé : décomposition du net, gains et pénalités, paiements. */
export function FicheEmploye({
  instantane,
  employe,
  droits,
  occupe,
  erreurServeur,
  mode,
  montantPaye,
  onMode,
  reference,
  referenceManquante,
  onReference,
  onMontantPaye,
  onAjouter,
  onRetirer,
  onRetenues,
  onPayer,
  onModifier,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const idErreur = useId();
  const idNote = useId();
  const idReference = useId();
  const [type, setType] = useState<TypeAjustement>('gain');
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [erreur, setErreur] = useState<ErreurAjustement | null>(null);
  const champLibelle = useRef<HTMLInputElement>(null);
  const champMontant = useRef<HTMLInputElement>(null);
  const titreAjustements = useRef<HTMLHeadingElement>(null);

  const { statut } = instantane;
  const c = calculerPaie(employe);
  const modifiable = estModifiable(statut) && droits.preparer;
  const peutPayer = paiementOuvert(statut) && droits.payer && c.reste > 0;
  const paiementPossible = paiementOuvert(statut) && droits.payer;
  // La maquette ne montre cette phrase qu'à qui ne peut pas payer ; le propriétaire, qui ne paie
  // jamais, lit que le gérant s'en charge plutôt qu'une attente de sa propre validation.
  const attente =
    statut === 'payee' || paiementPossible
      ? ''
      : t(
          paiementOuvert(statut)
            ? 'gestion.personnel.paiement.attenteProprietaire'
            : 'gestion.personnel.paiement.attente',
        );
  const precedent = moisPrecedent(instantane.mois, langue);

  const effacer = () => {
    setErreur(null);
    onModifier();
  };

  const message = erreur
    ? t(`gestion.personnel.saisie.erreurs.${erreur}`)
    : erreurServeur
      ? t('gestion.personnel.saisie.erreurs.defaut')
      : '';

  const ajouter = async () => {
    if (occupe) return;
    const trouvee = erreurAjustement(libelle, montant);
    setErreur(trouvee);
    if (trouvee) {
      (trouvee === 'libelle' ? champLibelle : champMontant).current?.focus();
      return;
    }
    const ajoutee = await onAjouter({ type, libelle: libelle.trim(), montant: Number(montant) });
    if (ajoutee) {
      setLibelle('');
      setMontant('');
      champLibelle.current?.focus();
    }
  };

  const lignes: Array<[string, string, 'mauvais' | 'bon' | null]> = [
    [t('gestion.personnel.fiche.base'), fmt(employe.base), null],
    [
      employe.absences
        ? t('gestion.personnel.fiche.absencesDetail', { jours: employe.absences })
        : t('gestion.personnel.fiche.absences'),
      c.absences ? `−${fmt(c.absences)}` : '0',
      'mauvais',
    ],
    [
      t('gestion.personnel.fiche.avances'),
      employe.avances ? `−${fmt(employe.avances)}` : '0',
      'mauvais',
    ],
    [
      t('gestion.personnel.fiche.impaye', { mois: precedent }),
      employe.impaye ? `+${fmt(employe.impaye)}` : '0',
      'bon',
    ],
  ];
  const couleur = (sens: 'mauvais' | 'bon' | null, valeur: string) =>
    valeur === '0' || !sens
      ? 'var(--ob-encre)'
      : sens === 'mauvais'
        ? 'var(--ob-bloquant-texte)'
        : 'var(--ob-ok-texte)';

  const puce = (actif: boolean) => `${styles.puce} ${actif ? styles.puceActive : ''}`;

  return (
    <section className={styles.fiche} aria-labelledby="fiche-employe">
      <div>
        <h2 id="fiche-employe" className={styles.ficheNom}>
          {employe.nom}
        </h2>
        <div className={styles.fichePoste}>{employe.poste}</div>
      </div>
      <ul className={styles.decomposition}>
        {lignes.map(([libelleLigne, valeur, sens]) => (
          <li key={libelleLigne} className={styles.decompo}>
            <span className={styles.decompoLibelle}>{libelleLigne}</span>
            <span className={styles.decompoValeur} style={{ color: couleur(sens, valeur) }}>
              {valeur}
            </span>
          </li>
        ))}
      </ul>
      <h3 ref={titreAjustements} tabIndex={-1} className={styles.sousTitre}>
        {t('gestion.personnel.fiche.ajustements')}
      </h3>
      <ul className={styles.ajustements}>
        {employe.ajustements.map((a) => {
          const gain = a.type === 'gain';
          const niveau = gain ? 'ok' : 'bloquant';
          const mot = t(gain ? 'gestion.personnel.fiche.gain' : 'gestion.personnel.fiche.penalite');
          return (
            <li key={a.id} className={styles.ajustement}>
              <Mot niveau={niveau} className={styles.motAjustement}>
                {mot}
              </Mot>
              <div className={styles.ajustementTexte}>
                <div className={styles.ajustementLibelle}>{a.libelle}</div>
                <div className={styles.ajustementMeta}>
                  {t('gestion.personnel.fiche.meta', {
                    type: mot,
                    date: jourMois(a.date, langue),
                    nom: a.par,
                  })}
                </div>
              </div>
              <span
                className={styles.ajustementMontant}
                style={{ color: `var(--ob-${niveau}-texte)` }}
              >{`${gain ? '+' : '−'}${fmt(a.montant)}`}</span>
              {modifiable && (
                <button
                  type="button"
                  className={styles.supprimer}
                  aria-disabled={occupe}
                  aria-label={t('gestion.personnel.fiche.supprimer', { libelle: a.libelle })}
                  onClick={() => {
                    if (occupe) return;
                    onRetirer(a.id);
                    titreAjustements.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {employe.ajustements.length === 0 && (
        <p className={styles.sansAjustement}>{t('gestion.personnel.fiche.aucun')}</p>
      )}
      {modifiable && (
        <AbsencesAvances
          key={`${employe.id}-${employe.absences}-${employe.avances}`}
          employe={employe}
          occupe={occupe}
          onEnregistrer={onRetenues}
        />
      )}
      {modifiable && (
        <form
          className={styles.saisie}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void ajouter();
          }}
        >
          <fieldset className={styles.puces}>
            <legend className={styles.invisible}>{t('gestion.personnel.saisie.type')}</legend>
            {(['gain', 'penalite'] as const).map((cle) => (
              <button
                type="button"
                key={cle}
                className={puce(type === cle)}
                aria-pressed={type === cle}
                onClick={() => {
                  setType(cle);
                  effacer();
                }}
              >
                {t(`gestion.personnel.saisie.types.${cle}`)}
              </button>
            ))}
          </fieldset>
          <label className={styles.etiquette}>
            {t('gestion.personnel.saisie.description')}
            <input
              ref={champLibelle}
              className={styles.champ}
              value={libelle}
              maxLength={120}
              aria-invalid={erreur === 'libelle'}
              aria-describedby={idErreur}
              onChange={(e) => {
                setLibelle(e.target.value);
                effacer();
              }}
            />
          </label>
          <label className={styles.etiquette}>
            {t('gestion.personnel.saisie.montant')}
            <input
              ref={champMontant}
              className={styles.champ}
              value={montant}
              inputMode="numeric"
              aria-invalid={erreur === 'montant'}
              aria-describedby={idErreur}
              onChange={(e) => {
                setMontant(e.target.value.replace(/\D/g, ''));
                effacer();
              }}
            />
          </label>
          <span className={styles.erreur} id={idErreur} role={message ? 'alert' : undefined}>
            {message}
          </span>
          <button
            type="submit"
            className={`${styles.principal} ${styles.ajouter}`}
            aria-disabled={occupe}
          >
            {t('gestion.personnel.saisie.ajouter')}
          </button>
        </form>
      )}
      <div className={styles.verrou}>{modifiable ? '' : t('gestion.personnel.fiche.verrou')}</div>
      <div className={styles.net}>
        <span>{t('gestion.personnel.fiche.net')}</span>
        <span className={styles.netValeur}>{`${fmt(c.net)} FCFA`}</span>
      </div>
      <div className={styles.cumul}>
        <span className={styles.cumulLibelle}>{t('gestion.personnel.fiche.paye')}</span>
        <span className={styles.cumulValeur}>{c.paye ? `${fmt(c.paye)} FCFA` : '—'}</span>
      </div>
      <div className={styles.cumul}>
        <span className={styles.cumulLibelle}>{t('gestion.personnel.fiche.reste')}</span>
        <span className={styles.cumulValeur}>{`${fmt(c.reste)} FCFA`}</span>
      </div>
      <ul className={styles.paiements}>
        {employe.paiements.map((p, rang) => (
          <li key={rang} className={styles.paiement}>
            {t(
              p.reference
                ? 'gestion.personnel.fiche.paiementReference'
                : 'gestion.personnel.fiche.paiement',
              {
                date: jourMois(p.date, langue),
                montant: fmt(p.montant),
                mode: t(`gestion.personnel.paiement.modes.${p.mode}`),
                nom: p.par,
                reference: p.reference,
              },
            )}
          </li>
        ))}
      </ul>
      {!instantane.aPreparer && (
        <button
          type="button"
          className={styles.secondaire}
          onClick={() => ouvrirLeBulletin(employe.id)}
        >
          {t('gestion.personnel.fiche.bulletin')}
        </button>
      )}
      {peutPayer && (
        <div className={styles.paiementBloc}>
          <h3 className={styles.paiementTitre}>{t('gestion.personnel.paiement.titre')}</h3>
          <input
            className={`${styles.champ} ${styles.montant}`}
            value={montantPaye}
            placeholder={String(c.reste)}
            inputMode="numeric"
            aria-label={t('gestion.personnel.paiement.titre')}
            aria-describedby={idNote}
            onChange={(e) => onMontantPaye(e.target.value.replace(/\D/g, ''))}
          />
          <fieldset className={styles.puces}>
            <legend className={styles.invisible}>{t('gestion.personnel.paiement.mode')}</legend>
            {MODES_PAIEMENT.map((cle) => (
              <button
                type="button"
                key={cle}
                className={puce(mode === cle)}
                aria-pressed={mode === cle}
                onClick={() => onMode(cle)}
              >
                {t(`gestion.personnel.paiement.modes.${cle}`)}
              </button>
            ))}
          </fieldset>
          {mode === 'mobile' && (
            <label className={styles.etiquette}>
              {t('gestion.personnel.paiement.reference')}
              <input
                className={styles.champ}
                value={reference}
                maxLength={60}
                aria-invalid={referenceManquante}
                aria-describedby={idReference}
                onChange={(e) => onReference(e.target.value)}
              />
              <span
                className={styles.erreur}
                id={idReference}
                role={referenceManquante ? 'alert' : undefined}
              >
                {referenceManquante ? t('gestion.personnel.paiement.referenceObligatoire') : ''}
              </span>
            </label>
          )}
          <button
            type="button"
            className={styles.principal}
            aria-disabled={occupe}
            aria-describedby={idNote}
            onClick={() => {
              if (!occupe) onPayer();
            }}
          >
            {t('gestion.personnel.paiement.payer', { nom: employe.nom })}
          </button>
          <span className={styles.noteBloc} id={idNote}>
            {t('gestion.personnel.paiement.note')}
          </span>
        </div>
      )}
      {attente && <div className={styles.noteBloc}>{attente}</div>}
    </section>
  );
}
