import { ReceiptText } from '../../modules/receipt-text';

import type { CurrencyCode } from '@/domain/money';
import { parseReceipt, type DateOrder, type ParsedReceipt } from '@/domain/receipt';
import type { DateFormatPref } from '@/api';
import { captureError } from '@/lib/monitoring';

/** False in demo builds, on web and in Expo Go, where there is no text recognizer. */
export const canScanReceipts = () => !!ReceiptText;

/** How to read an ambiguous date like 03/04/2026 for this user's date format. */
export const dateOrderFor = (pref: DateFormatPref): Exclude<DateOrder, 'YMD'> => (pref === 'MM/DD/YYYY' ? 'MDY' : 'DMY');

/**
 * Read a receipt photo on the device: recognise the text, then pull out the
 * merchant, date, total, items and tax. Returns null when it can't be done
 * (no recognizer in this build, or the photo couldn't be read), so callers
 * simply carry on without scanning.
 */
export async function scanReceipt(
  uri: string,
  opts: { currency: CurrencyCode; dateFormat: DateFormatPref },
): Promise<ParsedReceipt | null> {
  if (!ReceiptText) return null;
  try {
    const { blocks } = await ReceiptText.recognizeText(uri);
    return parseReceipt(
      blocks.flatMap((b) => b.lines),
      { currency: opts.currency, dateOrder: dateOrderFor(opts.dateFormat) },
    );
  } catch (e) {
    captureError(e, { where: 'scanReceipt' });
    return null;
  }
}
