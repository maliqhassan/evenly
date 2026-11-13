import { findAmounts, findDate, groupRows, parseReceipt, type OcrLine } from '../parse';

const TODAY = new Date(2026, 10, 13); // 13 Nov 2026

/** A printed receipt as ML Kit sees it: the name and the price are separate pieces on one row. */
function receipt(rows: [string, string?][]): OcrLine[] {
  const lines: OcrLine[] = [];
  rows.forEach(([left, right], i) => {
    const y = 100 + i * 50 + (i % 2 ? 3 : -2); // photos are never perfectly straight
    lines.push({ text: left, bounds: { x: 20, y, width: 300, height: 30 } });
    if (right) lines.push({ text: right, bounds: { x: 700, y: y + 1, width: 120, height: 30 } });
  });
  return lines;
}

const flat = (rows: string[]): OcrLine[] => rows.map((text) => ({ text, bounds: null }));

describe('groupRows', () => {
  it('puts an item and its price back on one row, left to right, whatever order they arrive in', () => {
    const lines = receipt([
      ['Burger', '12.50'],
      ['Fries', '4.00'],
    ]).reverse();
    expect(groupRows(lines)).toEqual(['Burger  12.50', 'Fries  4.00']);
  });

  it('keeps separate rows apart', () => {
    const rows = groupRows(receipt([['A'], ['B'], ['C']]));
    expect(rows).toEqual(['A', 'B', 'C']);
  });

  it('uses the order it was given when there are no positions', () => {
    expect(groupRows(flat(['Burger 12.50', '', 'Fries 4.00']))).toEqual(['Burger 12.50', 'Fries 4.00']);
  });
});

describe('findAmounts', () => {
  const amounts = (row: string, cur: 'USD' | 'EUR' | 'PKR' | 'JPY' = 'USD') =>
    findAmounts(row, cur).map((a) => a.minor);

  it('reads dot and comma decimals and thousands separators', () => {
    expect(amounts('Total 1,250.00')).toEqual([125000]);
    expect(amounts('Total 12.50')).toEqual([1250]);
    expect(amounts('Summe 1.250,50', 'EUR')).toEqual([125050]);
    expect(amounts('Brot 2,49', 'EUR')).toEqual([249]);
  });

  it('reads whole amounts next to a currency marker', () => {
    expect(amounts('Rice  Rs 1,850', 'PKR')).toEqual([185000]);
    expect(amounts('Oil PKR 620', 'PKR')).toEqual([62000]);
    expect(amounts('Total $45')).toEqual([4500]);
  });

  it('does not mistake rates, dates, times or phone numbers for money', () => {
    expect(amounts('GST 17%  8.50')).toEqual([850]);
    expect(amounts('Datum 12.11.2026')).toEqual([]);
    expect(amounts('Date 12/11/2026  14:05')).toEqual([]);
    expect(amounts('Tel 0300-1234567')).toEqual([]);
    expect(amounts('Visa **** 1234')).toEqual([]);
  });

  it('reads the trailing number for currencies without decimals', () => {
    expect(amounts('Ramen 900', 'JPY')).toEqual([900]);
    expect(amounts('Total 1,350', 'JPY')).toEqual([1350]);
    expect(amounts('Tel 03-1234-5678', 'JPY')).toEqual([]);
  });

  it('returns every amount on a row, left to right', () => {
    expect(amounts('2 x Burger  6.00  12.00')).toEqual([600, 1200]);
  });
});

describe('findDate', () => {
  const find = (row: string, order: 'MDY' | 'DMY' | 'YMD' = 'MDY') => findDate([row], order, TODAY);

  it('reads the common formats', () => {
    expect(find('12 Nov 2026')).toBe('2026-11-12');
    expect(find('Nov 12, 2026')).toBe('2026-11-12');
    expect(find('November 12th 2026')).toBe('2026-11-12');
    expect(find('2026-11-12')).toBe('2026-11-12');
    expect(find('12/11/26', 'DMY')).toBe('2026-11-12');
  });

  it('uses the user’s date order only when the numbers are ambiguous', () => {
    expect(find('03/04/2026', 'MDY')).toBe('2026-03-04');
    expect(find('03/04/2026', 'DMY')).toBe('2026-04-03');
    expect(find('13/11/2026', 'MDY')).toBe('2026-11-13'); // 13 can only be a day
    expect(find('11/13/2026', 'DMY')).toBe('2026-11-13'); // so the month is first
  });

  it('ignores dates that cannot be right', () => {
    expect(find('01/01/1999')).toBeNull(); // years ago
    expect(find('01/01/2030')).toBeNull(); // the future
    expect(find('31/02/2026', 'DMY')).toBeNull(); // not a day
  });

  it('takes the first date found', () => {
    expect(findDate(['Shop', 'Date 12.11.2026', 'Due 20.11.2026'], 'DMY', TODAY)).toBe('2026-11-12');
  });
});

describe('parseReceipt', () => {
  it('reads a restaurant bill: items, tax, tip and a total that adds up', () => {
    const r = parseReceipt(
      receipt([
        ["JOE'S DINER"],
        ['123 Main St'],
        ['Tel 555-0101'],
        ['Date: 11/12/2026'],
        ['2 x Burger', '24.00'],
        ['Fries', '6.50'],
        ['Cola', '3.00'],
        ['Subtotal', '33.50'],
        ['Sales Tax 8%', '2.68'],
        ['Tip', '5.00'],
        ['TOTAL', '41.18'],
        ['Visa **** 1234', '41.18'],
      ]),
      { currency: 'USD', dateOrder: 'MDY', today: TODAY },
    );
    expect(r.merchant).toBe("Joe's Diner");
    expect(r.date).toBe('2026-11-12');
    expect(r.total).toBe(4118);
    expect(r.totalIsGuess).toBe(false);
    expect(r.items).toEqual([
      { name: 'Burger', amount: 2400 },
      { name: 'Fries', amount: 650 },
      { name: 'Cola', amount: 300 },
    ]);
    expect(r.extra).toBe(768);
    expect(r.itemsTotal).toBe(4118);
    expect(r.itemsMatchTotal).toBe(true);
  });

  it('reads comma decimals and dotted dates', () => {
    const r = parseReceipt(
      receipt([
        ['SUPERMARKT MÜLLER'],
        ['Datum 12.11.2026'],
        ['Milch 1L', '1,29'],
        ['Brot', '2,49'],
        ['Käse', '12,90'],
        ['Total', '16,68'],
      ]),
      { currency: 'EUR', dateOrder: 'DMY', today: TODAY },
    );
    expect(r.merchant).toBe('Supermarkt Müller');
    expect(r.date).toBe('2026-11-12');
    expect(r.total).toBe(1668);
    expect(r.items.map((i) => [i.name, i.amount])).toEqual([
      ['Milch 1L', 129],
      ['Brot', 249],
      ['Käse', 1290],
    ]);
    expect(r.itemsMatchTotal).toBe(true);
  });

  it('reads rupee amounts written as whole numbers with Rs', () => {
    const r = parseReceipt(
      receipt([
        ['AL-FATEH STORE'],
        ['Date 12-11-2026'],
        ['Rice 5kg', 'Rs 1,850'],
        ['Oil 1L', 'Rs 620'],
        ['Total', 'Rs 2,470'],
      ]),
      { currency: 'PKR', dateOrder: 'DMY', today: TODAY },
    );
    expect(r.total).toBe(247000);
    expect(r.date).toBe('2026-11-12');
    expect(r.items).toEqual([
      { name: 'Rice 5kg', amount: 185000 },
      { name: 'Oil 1L', amount: 62000 },
    ]);
    expect(r.itemsMatchTotal).toBe(true);
  });

  it('reads yen, which has no decimals', () => {
    const r = parseReceipt(receipt([['Ramen House'], ['Ramen', '900'], ['Gyoza', '450'], ['Total', '1,350']]), {
      currency: 'JPY',
      today: TODAY,
    });
    expect(r.total).toBe(1350);
    expect(r.items.map((i) => i.amount)).toEqual([900, 450]);
    expect(r.itemsMatchTotal).toBe(true);
  });

  it('prefers the grand total over an earlier "Total", and ignores total-items and savings lines', () => {
    const r = parseReceipt(
      receipt([
        ['Pen', '20.00'],
        ['Notebook', '30.00'],
        ['Total Items 2'],
        ['Total', '50.00'],
        ['GST 17%', '8.50'],
        ['Grand Total', '58.50'],
        ['Total Savings', '2.00'],
      ]),
      { currency: 'USD', today: TODAY },
    );
    expect(r.total).toBe(5850);
    expect(r.extra).toBe(850);
    expect(r.itemsMatchTotal).toBe(true);
  });

  it('works out the total from the items when the receipt has no total line', () => {
    const r = parseReceipt(receipt([['Cafe Roma'], ['Latte', '4.50'], ['Muffin', '3.25']]), {
      currency: 'USD',
      today: TODAY,
    });
    expect(r.total).toBe(775);
    expect(r.totalIsGuess).toBe(true);
  });

  it('does not count registration numbers or payment lines as items or charges', () => {
    const r = parseReceipt(
      receipt([
        ['Corner Shop'],
        ['GST No 1234567-8'],
        ['Tea', '3.00'],
        ['Total', '3.00'],
        ['Cash', '10.00'],
        ['Change', '7.00'],
      ]),
      { currency: 'USD', today: TODAY },
    );
    expect(r.items).toEqual([{ name: 'Tea', amount: 300 }]);
    expect(r.extra).toBe(0);
    expect(r.total).toBe(300);
  });

  it('reports items that do not add up to the total, so the app does not trust them', () => {
    const r = parseReceipt(receipt([['Shop'], ['Tea', '3.00'], ['Cake', '4.00'], ['Total', '9.00']]), {
      currency: 'USD',
      today: TODAY,
    });
    expect(r.total).toBe(900);
    expect(r.itemsTotal).toBe(700);
    expect(r.itemsMatchTotal).toBe(false);
  });

  it('works from plain text lines with no positions', () => {
    const r = parseReceipt(flat(['Cafe Roma', 'Latte 4.50', 'Muffin 3.25', 'TOTAL 7.75']), {
      currency: 'USD',
      today: TODAY,
    });
    expect(r.total).toBe(775);
    expect(r.itemsMatchTotal).toBe(true);
  });

  it('finds nothing in noise, without throwing', () => {
    const r = parseReceipt(flat(['~~', '@@ ##', 'a']), { currency: 'USD', today: TODAY });
    expect(r).toMatchObject({ merchant: null, date: null, total: null, items: [], extra: 0, itemsMatchTotal: false });
    expect(parseReceipt([], { currency: 'USD', today: TODAY }).total).toBeNull();
  });

  it('skips headers and phone numbers when choosing the merchant', () => {
    const r = parseReceipt(flat(['TAX INVOICE', 'Tel: 021-555-0101', 'Bake & Brew', 'Latte 4.50', 'Total 4.50']), {
      currency: 'USD',
      today: TODAY,
    });
    expect(r.merchant).toBe('Bake & Brew');
  });
});
