export const UI_LOCALE = 'en-US';

const numberFormatter = new Intl.NumberFormat(UI_LOCALE);
const euroCurrencyFormatter = new Intl.NumberFormat(UI_LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const timestampFormatter = new Intl.DateTimeFormat(UI_LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export const formatUiNumber = (value: number): string => numberFormatter.format(value);

export const formatEuroCurrency = (value: number): string => euroCurrencyFormatter.format(value);

export const formatUiCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${formatUiNumber(count)} ${count === 1 ? singular : plural}`;

export const formatUiTimestamp = (value: string | number | Date): string =>
  timestampFormatter.format(new Date(value));
