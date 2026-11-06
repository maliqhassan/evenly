import { formatMoney, type CurrencyCode, type Minor } from '@/domain/money';
import { usePreferences } from '@/hooks/usePreferences';
import { colors, type TypographyVariant } from '@/theme';

import { Text, type TextProps } from './Text';

export type AmountTone = 'auto' | 'positive' | 'negative' | 'neutral' | 'muted' | 'inherit';

export interface AmountTextProps extends Omit<TextProps, 'children'> {
  minor: Minor;
  currency: CurrencyCode;
  /**
   * auto: green when > 0 (owed to you), red when < 0 (you owe), ink at 0.
   * positive/negative force a colour regardless of sign.
   */
  tone?: AmountTone;
  sign?: 'always' | 'negative' | 'never';
  trimZeroFraction?: boolean;
  variant?: TypographyVariant;
}

const toneColor = (tone: AmountTone, minor: Minor, fallback: string) => {
  switch (tone) {
    case 'positive':
      return colors.positive;
    case 'negative':
      return colors.negative;
    case 'muted':
      return colors.textSubtle;
    case 'neutral':
      return colors.ink;
    case 'inherit':
      return fallback;
    case 'auto':
      return minor > 0 ? colors.positive : minor < 0 ? colors.negative : colors.ink;
  }
};

/** Every money value in the app renders through this: tabular digits and consistent colour semantics. */
export function AmountText({
  minor,
  currency,
  tone = 'neutral',
  sign = 'negative',
  trimZeroFraction,
  variant = 'bodyStrong',
  color,
  ...rest
}: AmountTextProps) {
  const { locale } = usePreferences();
  const text = formatMoney(minor, currency, { locale, sign, trimZeroFraction });
  return (
    <Text
      variant={variant}
      tabular
      color={color ?? toneColor(tone, minor, colors.ink)}
      accessibilityLabel={text}
      {...rest}
    >
      {text}
    </Text>
  );
}
