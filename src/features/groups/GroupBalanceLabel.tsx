import type { Minor, CurrencyCode } from '@/domain/money';
import { formatMoney } from '@/domain/money';
import { usePreferences } from '@/hooks/usePreferences';
import { Text } from '@/components';
import { colors, type TypographyVariant } from '@/theme';

/**
 * "You are owed $260.00" / "You owe €84.20" / "Settled up". Multiple
 * currencies are listed separately, never summed.
 */
export function GroupBalanceLabel({
  nets,
  short,
  variant = 'secondaryStrong',
}: {
  nets: { currency: CurrencyCode; net: Minor }[];
  short?: boolean;
  variant?: TypographyVariant;
}) {
  const { locale } = usePreferences();
  if (nets.length === 0) {
    return (
      <Text variant={variant} color={colors.textSubtle}>
        Settled up
      </Text>
    );
  }
  const first = nets[0]!;
  const fmt = (n: { currency: CurrencyCode; net: Minor }) => formatMoney(Math.abs(n.net), n.currency, { locale });
  const positive = first.net > 0;
  const lead = short ? (positive ? 'Owed' : 'Owe') : positive ? 'You are owed' : 'You owe';
  const extra =
    nets.length > 1
      ? ` + ${nets
          .slice(1)
          .map((x) => `${x.net > 0 ? '+' : '−'}${fmt(x)}`)
          .join(' ')}`
      : '';
  return (
    <Text variant={variant} color={positive ? colors.positive : colors.negative} numberOfLines={1} tabular>
      {lead} {fmt(first)}
      {extra}
    </Text>
  );
}
