import type { TFunction } from 'i18next';

import { dateCourte } from '../../comptoir/session/affichage.ts';
import { numeroInventaire } from './regles.ts';
import type { Inventaire, LigneInventaire, Matiere, OrigineMouvement } from './types.ts';

export { dateCourte };

/** « 2,7 » en français, « 2.7 » en anglais : deux décimales au plus, sans zéro inutile. */
export function quantite(valeur: number, langue: string): string {
  return String(Math.round(valeur * 100) / 100).replace('.', langue === 'en' ? '.' : ',');
}

export const nomMatiere = (t: TFunction, matiere: Matiere) =>
  t(`comptoir.depenses.matieres.${matiere}.nom`);

/**
 * Unité d'une matière à l'écran : celle du stock du serveur (farine en kg ; sel, levure et améliorant
 * en g ; glace en sachets…), pour que l'écran et le serveur comptent pareil.
 */
export const uniteMatiere = (t: TFunction, matiere: Matiere) =>
  t(`comptoir.depenses.matieres.${matiere}.uniteServeur`);

/** « mer. 14 oct. » (français) ou « Wed Oct 14 » (anglais) pour un jour ISO. */
export function jourCourt(iso: string, langue: string): string {
  const jour = new Date(`${iso}T12:00:00Z`);
  const partie = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(langue, { ...options, timeZone: 'UTC' }).format(jour);
  if (langue === 'en') {
    return `${partie({ weekday: 'short' })} ${partie({ month: 'short' })} ${partie({ day: 'numeric' })}`;
  }
  return `${partie({ weekday: 'short' })} ${partie({ day: 'numeric' })} ${partie({ month: 'short' })}`;
}

/** « 14 oct. · 19:10 » pour un mouvement. */
export const jourEtHeure = (iso: string, heure: string, langue: string) =>
  `${dateCourte(iso, langue)} · ${heure}`;

/** D'où vient le mouvement : « DEP-0016 · achat en caisse », « Production jour du 14 oct. »… */
export function libelleOrigine(t: TFunction, origine: OrigineMouvement, langue: string): string {
  switch (origine.genre) {
    case 'depense':
      return t('atelier.stocks.origines.depense', {
        code: origine.code,
        achat:
          origine.achat === 'fournisseur'
            ? origine.fournisseur
            : t(`atelier.stocks.origines.achats.${origine.achat}`),
      });
    case 'production':
      return t(`atelier.stocks.origines.production.${origine.creneau}`, {
        date: dateCourte(origine.date, langue),
      });
    case 'reception':
      return t(
        origine.partielle
          ? 'atelier.stocks.origines.receptionPartielle'
          : 'atelier.stocks.origines.reception',
        { code: origine.code, fournisseur: origine.fournisseur },
      );
    case 'inventaire':
      return t('atelier.stocks.origines.inventaire', {
        code: origine.code,
        date: dateCourte(origine.date, langue),
      });
    case 'manuel':
      return t('atelier.stocks.origines.manuel', { motif: origine.motif });
  }
}

/** Signe d'un mouvement : « + » pour une entrée, « − » (moins typographique) pour le reste. */
export function signeDuMouvement(type: string, valeur: number): '+' | '−' {
  if (type === 'entree') return '+';
  if (type === 'ajustement') return valeur > 0 ? '+' : '−';
  return '−';
}

/** « Sel −0,8 kg · Glace −2 sachets » : les écarts d'un inventaire. */
export function resumeDesEcarts(t: TFunction, lignes: readonly LigneInventaire[], langue: string) {
  return lignes
    .map(
      (l) =>
        `${nomMatiere(t, l.matiere)} ${l.compte > l.theorique ? '+' : '−'}${quantite(
          Math.abs(l.compte - l.theorique),
          langue,
        )} ${uniteMatiere(t, l.matiere)}`,
    )
    .join(' · ');
}

export const codeInventaire = (inventaire: Pick<Inventaire, 'numero'>) =>
  numeroInventaire(inventaire.numero);
