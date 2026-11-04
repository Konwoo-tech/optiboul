import { useTranslation } from '@/i18n';
import { useId, useRef, useState } from 'react';

import {
  dateCourte,
  jourCourt,
  nomMatiere,
  quantite,
  quantiteAvecUnite,
  uniteMatiere,
} from './affichage.ts';
import styles from './Fournisseurs.module.css';
import { Mot } from './Mot.tsx';
import {
  filtrerQuantite,
  manque,
  matieresDe,
  NIVEAU_COMMANDE,
  quantiteSaisie,
  trierCommandes,
} from './regles.ts';
import type { Commande, InstantaneFournisseurs, Matiere, NouvelleCommande } from './types.ts';

type Props = {
  instantane: InstantaneFournisseurs;
  /** Le gérant planifie, réceptionne et relance ; le propriétaire consulte. */
  peutModifier: boolean;
  /** Une action est en cours d'envoi : les boutons sont verrouillés. */
  enCours: boolean;
  onReceptionner: (commande: Commande) => void;
  onRelancer: (commande: Commande) => void;
  onReplanifier: (commande: Commande) => void;
  /** Renvoie le code de l'erreur du serveur, ou `null` quand la réception est planifiée. */
  onPlanifier: (saisie: NouvelleCommande) => Promise<string | null>;
};

/** Réceptions : bons de commande à recevoir, reçus ou en manquant, et planification (US-100 à US-102). */
export function Receptions({
  instantane,
  peutModifier,
  enCours,
  onReceptionner,
  onRelancer,
  onReplanifier,
  onPlanifier,
}: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const idErreur = useId();
  const premier = instantane.fournisseurs[0];
  const [fournisseur, setFournisseur] = useState(premier?.id ?? '');
  const [matiere, setMatiere] = useState<Matiere>(premier?.matieres[0] ?? 'farine');
  const [quantiteTexte, setQuantiteTexte] = useState('');
  const [jour, setJour] = useState(instantane.jours[1] ?? instantane.jours[0] ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const champQuantite = useRef<HTMLInputElement>(null);

  const matieres = matieresDe(instantane.fournisseurs, fournisseur);
  const nomFournisseur = (id: string) =>
    instantane.fournisseurs.find((f) => f.id === id)?.nom ?? '';
  const message = erreur
    ? t(
        `gestion.fournisseurs.planifier.erreurs.${
          ['quantite', 'quantite_obligatoire'].includes(erreur) ? erreur : 'defaut'
        }`,
      )
    : '';

  const valider = async () => {
    if (!quantiteSaisie(quantiteTexte)) {
      setErreur('quantite');
      champQuantite.current?.focus();
      return;
    }
    const refus = await onPlanifier({
      fournisseur,
      matiere,
      quantite: quantiteSaisie(quantiteTexte),
      jour,
    });
    if (refus) {
      setErreur(refus);
      return;
    }
    setQuantiteTexte('');
  };

  const ligne = (c: Commande) => {
    const planifiee = c.statut === 'planifiee';
    const reste = manque(c);
    return (
      <li className={styles.ligne} key={c.numero}>
        <Mot niveau={NIVEAU_COMMANDE[c.statut]}>
          {t(`gestion.fournisseurs.receptions.statuts.${c.statut}`)}
        </Mot>
        <div className={styles.texte}>
          <div className={styles.titre}>
            {c.numero}
            {' · '}
            {nomMatiere(t, c.matiere)}
            {' · '}
            {quantiteAvecUnite(t, c.matiere, c.commandee, langue)}
          </div>
          <div className={styles.sous}>
            {nomFournisseur(c.fournisseur)}
            {' · '}
            {jourCourt(c.jour, langue)}
            {' · '}
            {planifiee || !c.recueLe
              ? t('gestion.fournisseurs.receptions.planifieePar', { nom: c.planifieePar })
              : t('gestion.fournisseurs.receptions.recuePar', {
                  nom: c.recuePar,
                  date: `${dateCourte(c.recueLe.jour, langue)} · ${c.recueLe.heure}`,
                })}
          </div>
          {c.statut === 'partielle' && (
            <div className={styles.manque}>
              {t('gestion.fournisseurs.receptions.manque', {
                quantite: quantite(reste, langue),
                unite: uniteMatiere(t, c.matiere),
              })}
              {' · '}
              {quantiteAvecUnite(t, c.matiere, c.recue, langue)}
            </div>
          )}
        </div>
        {peutModifier && planifiee && (
          <button
            type="button"
            className={styles.principal}
            disabled={enCours}
            aria-label={`${t('gestion.fournisseurs.receptions.receptionner')} ${c.numero}`}
            onClick={() => onReceptionner(c)}
          >
            {t('gestion.fournisseurs.receptions.receptionner')}
          </button>
        )}
        {peutModifier && c.statut === 'partielle' && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaire}
              disabled={enCours}
              aria-label={`${t('gestion.fournisseurs.receptions.relancer')} ${c.numero}`}
              onClick={() => onRelancer(c)}
            >
              {t('gestion.fournisseurs.receptions.relancer')}
            </button>
            <button
              type="button"
              className={styles.secondaire}
              disabled={enCours}
              aria-label={`${t('gestion.fournisseurs.receptions.replanifier')} ${c.numero}`}
              onClick={() => onReplanifier(c)}
            >
              {t('gestion.fournisseurs.receptions.replanifier')}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={styles.receptions}>
      <section
        className={`${styles.carte} ${styles.liste}`}
        aria-label={t('gestion.fournisseurs.receptions.liste')}
      >
        <div className={styles.regle}>{t('gestion.fournisseurs.receptions.regle')}</div>
        <ul className={styles.lignes}>{trierCommandes(instantane.commandes).map(ligne)}</ul>
        {instantane.commandes.length === 0 && (
          <div className={styles.vide}>{t('gestion.fournisseurs.receptions.vide')}</div>
        )}
      </section>

      {peutModifier && (
        <form
          className={styles.formulaire}
          noValidate
          aria-busy={enCours}
          onSubmit={(e) => {
            e.preventDefault();
            if (!enCours) void valider();
          }}
        >
          <h2 className={styles.titreFormulaire}>{t('gestion.fournisseurs.planifier.titre')}</h2>
          <label className={styles.etiquette}>
            {t('gestion.fournisseurs.planifier.fournisseur')}
            <select
              className={styles.champ}
              value={fournisseur}
              disabled={enCours}
              onChange={(e) => {
                setFournisseur(e.target.value);
                setMatiere(matieresDe(instantane.fournisseurs, e.target.value)[0] ?? 'farine');
                setErreur(null);
              }}
            >
              {instantane.fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.etiquette}>
            {t('gestion.fournisseurs.planifier.matiere')}
            <select
              className={styles.champ}
              value={matiere}
              disabled={enCours}
              onChange={(e) => {
                setMatiere(e.target.value as Matiere);
                setErreur(null);
              }}
            >
              {matieres.map((cle) => (
                <option key={cle} value={cle}>
                  {`${nomMatiere(t, cle)} (${uniteMatiere(t, cle)})`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.etiquette}>
            {t('gestion.fournisseurs.planifier.quantite')}
            <input
              className={styles.champ}
              ref={champQuantite}
              value={quantiteTexte}
              inputMode="decimal"
              disabled={enCours}
              onChange={(e) => {
                setQuantiteTexte(filtrerQuantite(e.target.value));
                setErreur(null);
              }}
              aria-invalid={Boolean(erreur) && erreur !== 'defaut'}
              aria-describedby={idErreur}
            />
          </label>
          <label className={styles.etiquette}>
            {t('gestion.fournisseurs.planifier.date')}
            <select
              className={styles.champ}
              value={jour}
              disabled={enCours}
              onChange={(e) => setJour(e.target.value)}
            >
              {instantane.jours.map((iso) => (
                <option key={iso} value={iso}>
                  {jourCourt(iso, langue)}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.erreur} id={idErreur} role={message ? 'alert' : undefined}>
            {message}
          </span>
          <button
            type="submit"
            className={`${styles.principal} ${styles.validerFormulaire}`}
            disabled={enCours}
          >
            {t('gestion.fournisseurs.planifier.enregistrer')}
          </button>
        </form>
      )}
    </div>
  );
}
