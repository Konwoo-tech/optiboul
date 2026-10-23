import type { Creneau } from '@/utils';
import type { TFunction } from 'i18next';

import { dateCourte } from '../session/affichage.ts';
import type { Depense, DemandeDepense, Rattachement, SessionRattachee } from './types.ts';
import { numeroDemande, validateurDe } from './regles.ts';

export { dateCourte };

/** « Nuit du 14 oct. » / « Night of Oct 14 » : session de production d'un rattachement. */
export function libelleSession(t: TFunction, session: SessionRattachee, langue: string): string {
  return t('comptoir.depenses.refSession', {
    type: t(`creneau.${session.type satisfies Creneau}Court`),
    date: dateCourte(session.date, langue),
  });
}

/**
 * Mois du budget en toutes lettres. En français : « d’octobre », « de novembre » (élision devant
 * une voyelle), pour « Budget d’octobre par catégorie » ; en anglais : « October ».
 */
export function moisDuBudget(mois: string, langue: string): string {
  const nom = new Intl.DateTimeFormat(langue, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${mois}-15T12:00:00Z`),
  );
  if (langue !== 'fr') return nom.charAt(0).toLocaleUpperCase(langue) + nom.slice(1);
  return /^[aeiouyâéèêîôû]/i.test(nom) ? `d’${nom}` : `de ${nom}`;
}

/** « Production · Nuit du 14 oct. », « Stock · Levure +5 kg » ou « Semaine 42 ». */
export function libelleRattachement(
  t: TFunction,
  rattachement: Rattachement,
  numeroSemaine: number | undefined,
  langue: string,
): string {
  if (rattachement.type === 'production') {
    return t('comptoir.depenses.rattache.production', {
      session: libelleSession(t, rattachement.session, langue),
    });
  }
  if (rattachement.type === 'stock') {
    return t('comptoir.depenses.rattache.stock', {
      matiere: t(`comptoir.depenses.matieres.${rattachement.matiere}.nom`),
      // « 2,5 » en français, « 2.5 » en anglais.
      quantite: String(rattachement.quantite).replace('.', langue === 'en' ? '.' : ','),
      unite: t(`comptoir.depenses.matieres.${rattachement.matiere}.unite`),
    });
  }
  return t('comptoir.depenses.rattache.semaine', { numero: numeroSemaine ?? '' });
}

/** « Saisie par Davy · Caissier · 14 oct. · caisse · justificatif joint ». */
export function libelleAuteur(t: TFunction, depense: Depense, langue: string): string {
  return t('comptoir.depenses.ligne.qui', {
    nom: depense.par,
    role: t(`profils.${depense.parProfil}`),
    date: dateCourte(depense.date, langue),
    mode: t(`comptoir.depenses.modesLigne.${depense.mode}`),
    justificatif: t(
      depense.photo ? 'comptoir.depenses.ligne.joint' : 'comptoir.depenses.ligne.sansJustificatif',
    ),
  });
}

/** Ligne cliquable sous une dépense : « DEM-021 · en attente du gérant de la semaine (Willy) ». */
export function libelleDemande(
  t: TFunction,
  demande: DemandeDepense,
  gerantDeLaSemaine: string,
  langue: string,
): string {
  const numero = numeroDemande(demande.numero);
  if (demande.statut === 'en-attente') {
    const validateur =
      validateurDe(demande.parProfil) === 'gerant'
        ? t('comptoir.depenses.validateurs.gerant', { nom: gerantDeLaSemaine })
        : t('comptoir.depenses.validateurs.proprietaire');
    return t('comptoir.depenses.demande.attente', { numero, validateur });
  }
  return t(
    demande.statut === 'refusee'
      ? 'comptoir.depenses.demande.refusee'
      : 'comptoir.depenses.demande.acceptee',
    {
      numero,
      nom: demande.decideePar,
      date: dateCourte(demande.decideeLe, langue),
      heure: demande.decideeA,
    },
  );
}
