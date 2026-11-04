import type { TFunction } from 'i18next';

import { nomMatiere, quantite, uniteMatiere } from '../../atelier/stocks/affichage.ts';
import type { Facture } from './types.ts';

export { jourCourt, nomMatiere, quantite, uniteMatiere } from '../../atelier/stocks/affichage.ts';
export { dateCourte } from '../../comptoir/session/affichage.ts';

/** « 6 kg », « 44 sacs » : une quantité avec l'unité de la matière. */
export const quantiteAvecUnite = (
  t: TFunction,
  matiere: Parameters<typeof nomMatiere>[1],
  valeur: number,
  langue: string,
) => `${quantite(valeur, langue)} ${uniteMatiere(t, matiere)}`;

/** « Farine · semaine 42 (44 sacs à ce jour) », « BC-032 · Levure, 6 kg reçus sur 10 »… */
export function libelleFacture(
  t: TFunction,
  facture: Pick<Facture, 'objet' | 'statut'>,
  langue: string,
): string {
  const { objet } = facture;
  if (objet.genre === 'farine') {
    return t(
      facture.statut === 'en-cours'
        ? 'gestion.fournisseurs.factures.objets.farineEnCours'
        : 'gestion.fournisseurs.factures.objets.farine',
      { semaine: objet.semaine, sacs: quantite(objet.sacs, langue) },
    );
  }
  const commun = {
    commande: objet.commande,
    matiere: nomMatiere(t, objet.matiere),
    unite: uniteMatiere(t, objet.matiere),
  };
  if (objet.genre === 'livraison') {
    return t('gestion.fournisseurs.factures.objets.livraison', {
      ...commun,
      quantite: quantite(objet.quantite, langue),
    });
  }
  return t(
    objet.commandee !== undefined
      ? 'gestion.fournisseurs.factures.objets.receptionPartielle'
      : 'gestion.fournisseurs.factures.objets.reception',
    {
      ...commun,
      quantite: quantite(objet.recue, langue),
      commandee: objet.commandee === undefined ? '' : quantite(objet.commandee, langue),
    },
  );
}
