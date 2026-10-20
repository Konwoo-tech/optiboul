import { Text, type TextProps } from '@mantine/core';
import { formatFCFA } from '@/utils';

type Props = TextProps & { montant: number };

/** Montant lisible : chiffres à chasse fixe, signe moins explicite (UX §5.1). */
export function MontantFCFA({ montant, ...props }: Props) {
  return (
    <Text component="span" ff="monospace" style={{ fontVariantNumeric: 'tabular-nums' }} {...props}>
      {formatFCFA(montant)}
    </Text>
  );
}
