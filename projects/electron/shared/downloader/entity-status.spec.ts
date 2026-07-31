import { describe, expect, test } from 'vitest';
import {
  createEntityStatusThresholds,
  deriveEntityStatuses,
  isEntityStatus,
  normalizeEntityStatus,
  normalizeEntityStatusSettings,
} from './entity-status.js';

describe('entity statuses', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  test('recognizes supported status values', () => {
    expect(isEntityStatus('new')).toBe(true);
    expect(isEntityStatus('old')).toBe(true);
    expect(isEntityStatus('needs-update')).toBe(false);
    expect(normalizeEntityStatus('needs-update')).toBe('old');
    expect(normalizeEntityStatus('old')).toBe('old');
    expect(isEntityStatus('unknown')).toBe(false);
    expect(normalizeEntityStatus('unknown')).toBeUndefined();
  });

  test('creates shared UTC thresholds and clamps calendar month ends', () => {
    expect(createEntityStatusThresholds('2024-08-31', now)).toEqual({
      asOfIso: '2026-07-24T12:00:00.000Z',
      newCutoffIso: '2026-07-21T12:00:00.000Z',
      oldCutoffDate: '2024-02-29',
    });
    expect(createEntityStatusThresholds('2023-08-31', now)?.oldCutoffDate).toBe('2023-02-28');
    expect(createEntityStatusThresholds('invalid', now)?.oldCutoffDate).toBeUndefined();
    expect(createEntityStatusThresholds('2026-07-24', new Date('invalid'))).toBeUndefined();
  });

  test('normalizes each invalid setting independently', () => {
    expect(normalizeEntityStatusSettings({ newDays: 10, oldMonths: 2 })).toEqual({
      newDays: 10,
      oldMonths: 2,
    });
    expect(normalizeEntityStatusSettings({ newDays: 0, oldMonths: 13 })).toEqual({
      newDays: 3,
      oldMonths: 6,
    });
    expect(normalizeEntityStatusSettings({ newDays: 30, oldMonths: '2' })).toEqual({
      newDays: 30,
      oldMonths: 6,
    });
    expect(normalizeEntityStatusSettings(undefined)).toEqual({ newDays: 3, oldMonths: 6 });
  });

  test('marks timestamps from exactly the configured number of days as new', () => {
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2026-07-21T12:00:00.000Z',
          updatedAt: '2026-07-24T12:00:00.000Z',
        },
        '2026-07-24',
        now,
        { newDays: 3, oldMonths: 6 },
      ),
    ).toEqual(['new']);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2026-07-21T11:59:59.999Z',
          updatedAt: '2026-07-24T12:00:00.000Z',
        },
        '2026-07-24',
        now,
        { newDays: 3, oldMonths: 6 },
      ),
    ).toEqual([]);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2026-07-14T12:00:00.000Z',
          updatedAt: '2026-07-24T12:00:00.000Z',
        },
        '2026-07-24',
        now,
        { newDays: 10, oldMonths: 6 },
      ),
    ).toEqual(['new']);
  });

  test('does not mark invalid or future creation timestamps as new', () => {
    expect(
      deriveEntityStatuses(
        { createdAt: 'invalid', updatedAt: '2026-07-24T12:00:00.000Z' },
        '2026-07-24',
        now,
      ),
    ).toEqual([]);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2026-07-24T12:00:00.001Z',
          updatedAt: '2026-07-24T12:00:00.000Z',
        },
        '2026-07-24',
        now,
      ),
    ).toEqual([]);
  });

  test('marks updates on the inclusive six-calendar-month cutoff', () => {
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-01-24T23:59:59.999Z',
        },
        '2026-07-24',
        now,
      ),
    ).toEqual(['old']);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-01-25T00:00:00.000Z',
        },
        '2026-07-24',
        now,
      ),
    ).toEqual([]);
  });

  test('uses the configured calendar-month cutoff for old statuses', () => {
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-05-24T23:59:59.999Z',
        },
        '2026-07-24',
        now,
        { newDays: 3, oldMonths: 2 },
      ),
    ).toEqual(['old']);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        },
        '2026-07-24',
        now,
        { newDays: 3, oldMonths: 2 },
      ),
    ).toEqual([]);
  });

  test('suppresses stale status for invalid or future update dates and invalid references', () => {
    expect(
      deriveEntityStatuses(
        { createdAt: '2025-01-01T00:00:00.000Z', updatedAt: 'invalid' },
        '2026-07-24',
        now,
      ),
    ).toEqual([]);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-07-24T12:00:00.001Z',
        },
        '2027-07-24',
        now,
      ),
    ).toEqual([]);
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2026-07-24T12:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        'invalid',
        now,
      ),
    ).toEqual(['new']);
  });

  test('returns both statuses in display order when rules overlap', () => {
    expect(
      deriveEntityStatuses(
        {
          createdAt: '2026-07-24T12:00:00.000Z',
          updatedAt: '2026-01-24T00:00:00.000Z',
        },
        '2026-07-24',
        now,
      ),
    ).toEqual(['new', 'old']);
  });
});
