import { useTranslation } from '@/i18n';
import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { messageDErreur, nomDuJour, uniteDe, libelleDe, type ErreurAffichee } from './affichage.ts';
import { lireLaSaisie, saisieDe, validerValeur } from './regles.ts';
import styles from './Parametres.module.css';
import { JOURS_DE_LA_SEMAINE, type Parametre, type ValeurParametre } from './types.ts';

/** Résultat d'un enregistrement : `null` quand la valeur est prise en compte. */
export type Echec = ErreurAffichee | null;
export type Enregistrer = (parametre: Parametre, valeur: ValeurParametre) => Promise<Echec>;

type Props = {
  parametre: Parametre;
  /** Lecture seule : l'administrateur consulte, il ne modifie pas. */
  lecture: boolean;
  enregistrer: Enregistrer;
};

/** Message d'erreur relié au champ (`aria-describedby`), effacé dès qu'on retape. */
function Erreur({ id, erreur }: { id: string; erreur: Exclude<Echec, null> | null }) {
  const { t } = useTranslation();
  return erreur ? (
    <span id={id} role="alert" className={styles.erreur}>
      {messageDErreur(t, erreur)}
    </span>
  ) : null;
}

/**
 * Valeur numérique ou heure : on tape, puis la valeur s'enregistre en quittant le champ ou sur
 * Entrée (pas à chaque touche : chaque enregistrement est une ligne du journal). Échap abandonne la
 * saisie. Une valeur refusée reste affichée avec son message jusqu'à la prochaine frappe.
 */
export function ChampTexte({
  parametre,
  lecture,
  enregistrer,
  compact = false,
  avecUnite = true,
  etiquetteId,
}: Props & { compact?: boolean; avecUnite?: boolean; etiquetteId?: string }) {
  const { t } = useTranslation();
  const identifiant = useId();
  const [saisie, setSaisie] = useState<string | null>(null);
  const [echec, setEchec] = useState<Exclude<Echec, null> | null>(null);
  // Garde synchrone : Entrée puis sortie du champ ne lancent qu'un seul envoi.
  const envoi = useRef(false);
  // Dernière saisie tapée : une saisie retapée pendant l'envoi n'est pas écrasée.
  const saisieCourante = useRef<string | null>(null);
  const heure = parametre.genre === 'heure';
  const affichee = saisie ?? (heure ? String(parametre.valeur) : saisieDe(parametre.valeur));
  const unite = avecUnite ? uniteDe(t, parametre) : '';

  const valider = async () => {
    if (saisie === null || envoi.current) return;
    const lue = heure ? validerValeur(parametre, saisie.trim()) : lireLaSaisie(parametre, saisie);
    if (!lue.ok) {
      setEchec(lue.erreur);
      return;
    }
    envoi.current = true;
    try {
      const envoyee = saisie;
      const resultat = await enregistrer(parametre, lue.valeur);
      if (resultat) setEchec(resultat);
      else {
        // Retapé pendant l'envoi : la nouvelle saisie reste, elle sera lue à la prochaine sortie.
        if (saisieCourante.current === envoyee) {
          saisieCourante.current = null;
          setSaisie(null);
          setEchec(null);
        }
      }
    } finally {
      envoi.current = false;
    }
  };

  const toucher = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void valider();
    } else if (e.key === 'Escape') {
      saisieCourante.current = null;
      setSaisie(null);
      setEchec(null);
    }
  };

  return (
    <>
      <div className={styles.ligneChamp}>
        <input
          id={identifiant}
          className={`${styles.champ} ${compact ? styles.champCompact : ''}`}
          value={affichee}
          inputMode={heure ? 'text' : 'numeric'}
          readOnly={lecture}
          aria-readonly={lecture || undefined}
          aria-labelledby={etiquetteId}
          aria-label={etiquetteId ? undefined : libelleDe(t, parametre)}
          aria-invalid={echec ? true : undefined}
          aria-describedby={echec ? `${identifiant}-erreur` : undefined}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            saisieCourante.current = e.target.value;
            setSaisie(e.target.value);
            setEchec(null);
          }}
          onBlur={() => void valider()}
          onKeyDown={toucher}
        />
        {avecUnite ? <span className={styles.unite}>{unite}</span> : null}
      </div>
      <Erreur id={`${identifiant}-erreur`} erreur={echec} />
    </>
  );
}

/** Liste de valeurs permises (jour de la semaine, inactivité) : le choix s'enregistre aussitôt. */
export function ChampChoix({ parametre, lecture, enregistrer }: Props) {
  const { t } = useTranslation();
  const identifiant = useId();
  const [echec, setEchec] = useState<Exclude<Echec, null> | null>(null);
  const envoi = useRef(false);
  const jour = parametre.genre === 'jour';
  const options: ValeurParametre[] = jour ? [...JOURS_DE_LA_SEMAINE] : parametre.choix;
  const unite = jour ? '' : uniteDe(t, parametre);

  const choisir = async (texte: string) => {
    if (envoi.current) return;
    const valeur = jour ? texte : Number(texte);
    envoi.current = true;
    try {
      setEchec(await enregistrer(parametre, valeur));
    } finally {
      envoi.current = false;
    }
  };

  return (
    <>
      <div className={styles.ligneChamp}>
        <select
          id={identifiant}
          className={styles.selecteur}
          value={String(parametre.valeur)}
          disabled={lecture}
          aria-label={libelleDe(t, parametre)}
          aria-invalid={echec ? true : undefined}
          aria-describedby={echec ? `${identifiant}-erreur` : undefined}
          onChange={(e) => void choisir(e.target.value)}
        >
          {options.map((o) => (
            <option key={String(o)} value={String(o)}>
              {jour ? nomDuJour(t, String(o)) : String(o)}
            </option>
          ))}
        </select>
        {unite ? <span className={styles.unite}>{unite}</span> : null}
      </div>
      <Erreur id={`${identifiant}-erreur`} erreur={echec} />
    </>
  );
}

/** Jours à cocher (relances, contrôles de stock) : chaque case s'enregistre aussitôt. */
export function ChampJours({ parametre, lecture, enregistrer }: Props) {
  const { t } = useTranslation();
  const identifiant = useId();
  const [echec, setEchec] = useState<Exclude<Echec, null> | null>(null);
  const envoi = useRef(false);
  const retenus = Array.isArray(parametre.valeur) ? parametre.valeur : [];

  const basculer = async (jour: string) => {
    if (envoi.current) return;
    const suivants = retenus.includes(jour)
      ? retenus.filter((j) => j !== jour)
      : [...retenus, jour];
    envoi.current = true;
    try {
      setEchec(await enregistrer(parametre, suivants));
    } finally {
      envoi.current = false;
    }
  };

  return (
    <>
      <fieldset
        className={styles.jours}
        aria-label={libelleDe(t, parametre)}
        aria-describedby={echec ? `${identifiant}-erreur` : undefined}
      >
        {JOURS_DE_LA_SEMAINE.map((jour) => (
          <label key={jour} className={styles.jour}>
            <input
              type="checkbox"
              checked={retenus.includes(jour)}
              disabled={lecture}
              onChange={() => void basculer(jour)}
            />
            {nomDuJour(t, jour)}
          </label>
        ))}
      </fieldset>
      <Erreur id={`${identifiant}-erreur`} erreur={echec} />
    </>
  );
}

/** Le bon champ selon le genre du paramètre. */
export function ChampParametre(props: Props) {
  switch (props.parametre.genre) {
    case 'jour':
    case 'choix':
      return <ChampChoix {...props} />;
    case 'jours':
      return <ChampJours {...props} />;
    default:
      return <ChampTexte {...props} compact />;
  }
}
