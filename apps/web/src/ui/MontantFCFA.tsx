import { Text, type TextProps } from '@mantine/core';
import { formatFCFA } from '@/utils';

type Props = TextProps & { montant: number };

/** Montant lisible : chiffres tabulaires de Manrope, signe moins explicite (UX §5.1). */
export function MontantFCFA({ montant, ...props }: Props) {
  return (
    <Text component="span" fw={800} style={{ fontVariantNumeric: 'tabular-nums' }} {...props}>
      {formatFCFA(montant)}
    </Text>
  );
}
