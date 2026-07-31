import { isReferenceDate } from './reference-date.js';

export const entityStatuses = ['new', 'old'] as const;
export type EntityStatus = (typeof entityStatuses)[number];

export interface EntityStatusSettings {
  newDays: number;
  oldMonths: number;
}

export const defaultEntityStatusSettings: Readonly<EntityStatusSettings> = {
  newDays: 3,
  oldMonths: 6,
};

export const entityStatusSettingLimits = {
  newDays: { min: 1, max: 30 },
  oldMonths: { min: 1, max: 12 },
} as const;

export interface EntityStatusTimestamps {
  createdAt: string;
  updatedAt: string;
}

export interface EntityStatusThresholds {
  asOfIso: string;
  newCutoffIso: string;
  oldCutoffDate?: string;
}

export const isEntityStatus = (value: unknown): value is EntityStatus =>
  typeof value === 'string' && entityStatuses.includes(value as EntityStatus);

export function normalizeEntityStatus(value: unknown): EntityStatus | undefined {
  if (isEntityStatus(value)) return value;
  return value === 'needs-update' ? 'old' : undefined;
}

export function normalizeEntityStatusSettings(value: unknown): EntityStatusSettings {
  const candidate =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    newDays: validSetting(
      candidate['newDays'],
      entityStatusSettingLimits.newDays,
      defaultEntityStatusSettings.newDays,
    ),
    oldMonths: validSetting(
      candidate['oldMonths'],
      entityStatusSettingLimits.oldMonths,
      defaultEntityStatusSettings.oldMonths,
    ),
  };
}

function validSetting(
  value: unknown,
  limits: { readonly min: number; readonly max: number },
  fallback: number,
): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= limits.min &&
    value <= limits.max
    ? value
    : fallback;
}

function timestampMilliseconds(value: string): number | undefined {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function utcDate(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function subtractCalendarMonths(value: string, months: number): string | undefined {
  if (!isReferenceDate(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const monthIndex = year * 12 + month - 1 - months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetMonth = String(targetMonthIndex + 1).padStart(2, '0');
  const targetDay = String(Math.min(day, lastDay)).padStart(2, '0');
  return `${targetYear}-${targetMonth}-${targetDay}`;
}

export function createEntityStatusThresholds(
  referenceDate: string | undefined,
  asOf = new Date(),
  settings: unknown = defaultEntityStatusSettings,
): EntityStatusThresholds | undefined {
  const asOfMilliseconds = asOf.getTime();
  if (!Number.isFinite(asOfMilliseconds)) return undefined;
  const normalizedSettings = normalizeEntityStatusSettings(settings);
  return {
    asOfIso: new Date(asOfMilliseconds).toISOString(),
    newCutoffIso: new Date(
      asOfMilliseconds - normalizedSettings.newDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    oldCutoffDate: referenceDate
      ? subtractCalendarMonths(referenceDate, normalizedSettings.oldMonths)
      : undefined,
  };
}

export function deriveEntityStatuses(
  timestamps: EntityStatusTimestamps,
  referenceDate?: string,
  asOf = new Date(),
  settings: unknown = defaultEntityStatusSettings,
): EntityStatus[] {
  const thresholds = createEntityStatusThresholds(referenceDate, asOf, settings);
  if (!thresholds) return [];

  const asOfMilliseconds = Date.parse(thresholds.asOfIso);
  const statuses: EntityStatus[] = [];
  const createdAt = timestampMilliseconds(timestamps.createdAt);
  if (
    createdAt !== undefined &&
    createdAt <= asOfMilliseconds &&
    createdAt >= Date.parse(thresholds.newCutoffIso)
  ) {
    statuses.push('new');
  }

  const updatedAt = timestampMilliseconds(timestamps.updatedAt);
  if (
    updatedAt !== undefined &&
    updatedAt <= asOfMilliseconds &&
    thresholds.oldCutoffDate !== undefined &&
    utcDate(updatedAt) <= thresholds.oldCutoffDate
  ) {
    statuses.push('old');
  }

  return statuses;
}
