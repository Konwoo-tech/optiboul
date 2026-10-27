import { formaterNombre } from '@/utils';
import type { TFunction } from 'i18next';

import { cheminEcran } from '../../../navigation.ts';
import { dateCourte } from '../../comptoir/session/affichage.ts';
import type { Alerte, DestinationAlerte } from './types.ts';

const CLE = 'gestion.tableauDeBord';

/** « octobre » (français) ou « October » (anglais), le mois en toutes lettres des titres. */
export function nomDuMois(mois: string, langue: string): string {
  const nom = new Intl.DateTimeFormat(langue, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${mois}-15T12:00:00Z`),
  );
  return langue === 'fr' ? nom : nom.charAt(0).toLocaleUpperCase(langue) + nom.slice(1);
}

/** Jour du mois d'une date « AAAA-MM-JJ » : le libellé de chaque barre du graphique. */
export const jourDuMois = (iso: string): number => Number(iso.slice(8, 10));

/** « 14 » en français, « 14th » en anglais (« The 14th (yellow) is the current session »). */
export function jourOrdinal(jour: number, langue: string): string {
  if (langue !== 'en') return String(jour);
  const categorie = new Intl.PluralRules('en', { type: 'ordinal' }).select(jour);
  const suffixe = { one: 'st', two: 'nd', few: 'rd' }[categorie as 'one' | 'two' | 'few'] ?? 'th';
  return `${jour}${suffixe}`;
}

/** Taux avec la virgule du français ou le point de l'anglais : « 96,2 » / « 96.2 ». */
export function formaterTaux(taux: number, langue: string): string {
  return taux.toFixed(1).replace('.', langue === 'en' ? '.' : ',');
}

/** Phrase de l'alerte, traduite, avec ses nombres et ses dates mis en forme. */
export function texteAlerte(t: TFunction, alerte: Alerte, langue: string): string {
  const cle = `${CLE}.alertes.types.${alerte.type}`;
  switch (alerte.type) {
    case 'facture-en-retard':
      return t(cle, { numero: alerte.numero, montant: formaterNombre(alerte.montant) });
    case 'stock-bas':
      return t(cle, { matiere: t(`comptoir.depenses.matieres.${alerte.matiere}.nom`) });
    case 'clients-au-dela-du-plafond':
      return t(cle, { clients: alerte.clients, plafond: formaterNombre(alerte.plafond) });
    case 'budget-depasse':
      return t(cle, { categorie: t(`comptoir.depenses.categories.${alerte.categorie}`) });
    case 'production-non-cloturee':
      return t(cle, {
        date: dateCourte(alerte.jour, langue),
        creneau: t(`${CLE}.creneaux.${alerte.creneau}`),
      });
    case 'manquant-fournisseur':
      return t(cle, { commande: alerte.commande, manque: formaterNombre(alerte.manque) });
    case 'manque-de-caisse':
      return t(cle, {
        date: dateCourte(alerte.jour, langue),
        creneau: t(`${CLE}.creneaux.${alerte.creneau}`),
        caissiere: alerte.caissiere,
        ecart: formaterNombre(alerte.ecart),
      });
    case 'demandes-en-attente':
      return t(cle, { nombre: alerte.nombre });
    case 'ecart-matiere':
      return t(cle, { par: alerte.par, motif: alerte.motif });
  }
}

/** Adresse de l'écran que l'alerte ouvre, avec son filtre ou son onglet. */
export function cheminAlerte({ espace, ecran, parametres }: DestinationAlerte): string {
  const chemin = cheminEcran({ espace, cle: ecran });
  return parametres ? `${chemin}?${new URLSearchParams(parametres)}` : chemin;
}
