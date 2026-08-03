import { Datatype, type Field } from 'fifatables';

import type {
  TableRowValues,
  TableValue,
  ValidationIssue,
  ValidationSeverity,
} from '../shared/contracts';

const MAX_SAMPLES = 25;

export const displayValue = (
  value: TableValue | undefined,
): TableValue | '(missing)' | '(empty)' => {
  if (value === undefined) return '(missing)';
  if (value === '') return '(empty)';
  return typeof value === 'string' && value.length > 120 ? `${value.slice(0, 117)}…` : value;
};

export const validateRows = (
  table: string,
  rows: { rowId: number; values: TableRowValues }[],
  fields: readonly Field[],
): ValidationIssue[] => {
  const issues = new Map<string, ValidationIssue>();
  const uniqueValues = new Map<string, Map<TableValue, number>>();

  const add = (
    severity: ValidationSeverity,
    field: string | undefined,
    message: string,
    rowId: number,
    value: TableValue | undefined,
  ): void => {
    const key = `${severity}\u0000${table}\u0000${field ?? ''}\u0000${message}`;
    const issue = issues.get(key);
    if (issue) {
      issue.occurrences += 1;
      if (issue.samples.length < MAX_SAMPLES)
        issue.samples.push({ rowId, value: displayValue(value) });
    } else {
      issues.set(key, {
        severity,
        table,
        ...(field ? { field } : {}),
        message,
        occurrences: 1,
        samples: [{ rowId, value: displayValue(value) }],
      });
    }
  };

  for (const row of rows) {
    for (const field of fields) {
      const value = row.values[field.name];
      if (value === undefined || value === '') {
        if (field.type !== Datatype.String)
          add(
            'error',
            field.name,
            field.type === Datatype.Int
              ? 'Value is not a valid integer.'
              : 'Value is not a valid number.',
            row.rowId,
            value,
          );
        continue;
      }

      if (field.unique) {
        const values = uniqueValues.get(field.name) ?? new Map<TableValue, number>();
        if (values.has(value)) add('error', field.name, 'Value must be unique.', row.rowId, value);
        else values.set(value, row.rowId);
        uniqueValues.set(field.name, values);
      }

      if (field.type === Datatype.String) continue;
      const number =
        typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
      if (!Number.isFinite(number)) {
        add(
          'error',
          field.name,
          field.type === Datatype.Int
            ? 'Value is not a valid integer.'
            : 'Value is not a valid number.',
          row.rowId,
          value,
        );
        continue;
      }
      if (field.type === Datatype.Int && !Number.isInteger(number)) {
        add('error', field.name, 'Value is not a valid integer.', row.rowId, value);
        continue;
      }
      if (field.range && (number < field.range.min || number > field.range.max))
        add(
          'warning',
          field.name,
          `Value is outside the published range ${field.range.min}–${field.range.max}.`,
          row.rowId,
          value,
        );
    }
  }
  return [...issues.values()];
};
