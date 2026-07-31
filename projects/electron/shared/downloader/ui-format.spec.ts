import { describe, expect, test } from 'vitest';
import {
  formatEuroCurrency,
  formatUiCount,
  formatUiNumber,
  formatUiTimestamp,
  UI_LOCALE,
} from './ui-format.js';

describe('UI formatting', () => {
  test('uses deterministic en-US number, currency, and count formatting', () => {
    expect(UI_LOCALE).toBe('en-US');
    expect(formatUiNumber(12_345)).toBe('12,345');
    expect(formatEuroCurrency(1_250_000)).toBe('€1,250,000');
    expect(formatUiCount(12_345, 'record')).toBe('12,345 records');
    expect(formatUiCount(1, 'record')).toBe('1 record');
  });

  test('retains medium date and time detail for timestamps', () => {
    const timestamp = new Date(2026, 6, 25, 14, 5, 6);
    expect(formatUiTimestamp(timestamp)).toBe('Jul 25, 2026, 2:05:06 PM');
  });
});
