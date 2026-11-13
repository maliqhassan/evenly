import { StyleSheet, View } from 'react-native';

import { AmountText, Button, Card, Icon, Sheet, Text, type IconName } from '@/components';
import type { CurrencyCode } from '@/domain/money';
import type { ParsedReceipt } from '@/domain/receipt';
import { usePreferences } from '@/hooks/usePreferences';
import { t } from '@/i18n';
import { formatDate } from '@/lib/dates';
import { colors, radii, spacing } from '@/theme';

interface Props {
  /** The scan result; the sheet is shown while this is set. */
  receipt: ParsedReceipt | null;
  currency: CurrencyCode;
  onUseTotal: () => void;
  onSplitByItem: () => void;
  onClose: () => void;
}

function Row({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={colors.textFaint} />
      <Text variant="secondary" color={colors.textMuted} style={{ width: 74 }}>
        {label}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

/**
 * What the receipt scan found. Nothing is changed until the user chooses:
 * reading a photo is a best guess, so they confirm before it fills the form.
 */
export function ReceiptScanSheet({ receipt, currency, onUseTotal, onSplitByItem, onClose }: Props) {
  const { dateFormat } = usePreferences();
  const r = receipt;
  // Items are only offered when they add up to the receipt's total, which is how we know they were read right.
  const offerItems = !!r && r.items.length > 0 && r.itemsMatchTotal;

  return (
    <Sheet visible={!!r} onClose={onClose} title={t('Receipt scanned')}>
      {r ? (
        <View style={styles.body}>
          <Card radius={radii.card} padded style={{ gap: 12 }}>
            {r.merchant ? (
              <Row icon="receipt" label={t('Place')}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {r.merchant}
                </Text>
              </Row>
            ) : null}
            <Row icon="banknote" label={t('Total')}>
              {r.total !== null ? (
                <AmountText minor={r.total} currency={currency} variant="bodyLgStrong" />
              ) : (
                <Text variant="bodyMedium" color={colors.textFaint}>
                  {t('Not found')}
                </Text>
              )}
            </Row>
            {r.date ? (
              <Row icon="calendar" label={t('Date')}>
                <Text variant="bodyMedium">{formatDate(r.date, dateFormat)}</Text>
              </Row>
            ) : null}
            {r.items.length > 0 ? (
              <Row icon="file-text" label={t('Items')}>
                <Text variant="bodyMedium">
                  {r.items.length} {r.items.length === 1 ? 'item' : 'items'}
                  {r.extra > 0 ? ' + tax & tip' : ''}
                </Text>
              </Row>
            ) : null}
          </Card>

          {r.totalIsGuess && r.total !== null ? (
            <Text variant="caption" color={colors.textSubtle}>
              {t('There was no total line, so this is our best guess. Check it before saving.')}
            </Text>
          ) : null}
          {r.items.length > 0 && !offerItems ? (
            <Text variant="caption" color={colors.textSubtle}>
              {t('The items didn’t add up to the total, so they aren’t offered. You can still enter them yourself.')}
            </Text>
          ) : null}
          <Text variant="caption" color={colors.textSubtle}>
            Read as {currency}. Photos can be misread, so check the amounts.
          </Text>

          <View style={{ gap: spacing.md }}>
            <Button label={t('Use these details')} onPress={onUseTotal} />
            {offerItems ? (
              <Button label={t('Split by item')} icon="receipt" variant="muted" onPress={onSplitByItem} />
            ) : null}
            <Button label={t('Not now')} variant="outline" size="md" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.screen, gap: spacing['3xl'], paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
