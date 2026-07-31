const escapeCsv = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (rows: readonly object[], columns: readonly string[]): string => {
  const header = columns.join(',');
  const body = rows.map((row) => {
    const record = row as Record<string, unknown>;
    return columns.map((column) => escapeCsv(record[column])).join(',');
  });
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
};

export const toJson = (value: object): string => `${JSON.stringify(value, null, 2)}\n`;
