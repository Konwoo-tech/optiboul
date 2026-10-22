import type { TFunction } from 'i18next';

import {
  ecartDeCaisse,
  especesAttendues,
  formaterNombre,
  formaterSigne,
  totauxDesLivraisons,
} from './calculs.ts';
import type { InstantaneSession } from './types.ts';

export type LigneRecapitulatif = {
  cle: string;
  libelle: string;
  /** Montant formaté, sans « FCFA ». */
  valeur: string;
  /** Couleur du texte : variable de la palette. */
  couleur: string;
};

const ENCRE = 'var(--ob-encre)';

/** Les huit lignes du récapitulatif de la session ; la fenêtre de clôture en montre six. */
export function lignesDuRecapitulatif(
  instantane: InstantaneSession,
  t: TFunction,
): LigneRecapitulatif[] {
  const totaux = totauxDesLivraisons(instantane.livraisons);
  const ligne = (cle: string, montant: number, couleur = ENCRE): LigneRecapitulatif => ({
    cle,
    libelle: t(`comptoir.session.cloture.lignes.${cle}`),
    valeur: formaterNombre(montant),
    couleur,
  });
  return [
    ligne('attendue', totaux.du),
    ligne('especes', totaux.especes),
    ligne('mtn', totaux.mtn),
    ligne('orange', totaux.orange),
    ligne('dettes', totaux.dette, 'var(--ob-surveiller-texte)'),
    ligne('remboursements', totaux.remboursements, 'var(--ob-ok-texte)'),
    ligne('depenses', -instantane.depensesCaisse),
    ligne('fonds', instantane.session.fonds),
  ];
}

/** Espèces attendues dans le tiroir-caisse à la clôture. */
export function especesAttenduesDeLaSession(instantane: InstantaneSession): number {
  const { especes } = totauxDesLivraisons(instantane.livraisons);
  return especesAttendues(instantane.session.fonds, especes, instantane.depensesCaisse);
}

/** Écart de caisse en texte : « −500 FCFA », ou « — » tant que rien n'est compté. */
export function ecartEnTexte(instantane: InstantaneSession): string {
  const ecart = ecartDeCaisse(
    instantane.session.especesComptees,
    especesAttenduesDeLaSession(instantane),
  );
  return ecart.compte ? `${formaterSigne(ecart.ecart)} FCFA` : '—';
}

/** Le mot qui accompagne l'écart : « Caisse juste », « Manque 500 FCFA »… */
export function motDeLEcart(instantane: InstantaneSession, t: TFunction): string {
  const { compte, ecart } = ecartDeCaisse(
    instantane.session.especesComptees,
    especesAttenduesDeLaSession(instantane),
  );
  if (!compte) return t('comptoir.session.cloture.saisir');
  if (ecart === 0) return t('comptoir.session.cloture.juste');
  return ecart < 0
    ? t('comptoir.session.cloture.manque', { montant: formaterNombre(-ecart) })
    : t('comptoir.session.cloture.excedent', { montant: formaterNombre(ecart) });
}
