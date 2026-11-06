import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** Use tabular numerals (all money uses AmountText, which sets this). */
  tabular?: boolean;
}

export function Text({ variant = 'body', color = colors.text, align, tabular, style, ...rest }: TextProps) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[
        typography[variant],
        { color },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    />
  );
}
