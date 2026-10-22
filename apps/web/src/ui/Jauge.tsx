import { Progress } from '@mantine/core';
import { COULEURS_FIXES, niveauDeRatio, type NiveauSeuil } from '@/utils';

const COULEUR: Record<NiveauSeuil, string> = {
  ok: COULEURS_FIXES.succes,
  surveiller: COULEURS_FIXES.ambre,
  bloquant: COULEURS_FIXES.erreur,
};

type Props = {
  valeur: number;
  maximum: number;
  /** Texte lu par les lecteurs d'écran (ex. « Dette de 1 500 sur 2 000 FCFA »). */
  libelle: string;
};

/** Barre de progression d'un budget ou d'une dette : verte, ambre dès 85 %, rouge à 100 %. */
export function Jauge({ valeur, maximum, libelle }: Props) {
  const pourcentage = maximum > 0 ? Math.min(100, (valeur / maximum) * 100) : 100;
  return (
    <Progress
      value={pourcentage}
      size={8}
      radius="xl"
      color={COULEUR[niveauDeRatio(valeur, maximum)]}
      aria-label={libelle}
    />
  );
}
