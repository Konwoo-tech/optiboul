import { Paper, type ElementProps, type PaperProps } from '@mantine/core';

type Props = PaperProps & ElementProps<'div', keyof PaperProps>;

/** Carte de contenu : surface, bordure fine, angles de 16 px, marge intérieure de 16 px. */
export function Carte(props: Props) {
  return <Paper withBorder p="md" bg="var(--ob-surface)" {...props} />;
}
