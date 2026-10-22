import { Paper, type ElementProps, type PaperProps } from '@mantine/core';

type Props = PaperProps & ElementProps<'div', keyof PaperProps>;

/** Carte de contenu : surface, bordure fine, angles de 16 px, marge intérieure de 16 px. */
export function Carte(props: Props) {
  // La bordure vient de la palette (Mantine garderait ses gris : paper-border-color).
  return <Paper p="md" bg="var(--ob-surface)" bd="1px solid var(--ob-ligne)" {...props} />;
}
