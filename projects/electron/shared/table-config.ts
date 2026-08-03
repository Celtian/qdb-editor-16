import { Datatype, type Field, Fifa, Table, fifaTableConfig, sortByOrder } from 'fifatables';

import type { FieldDescriptor, TableValue } from './contracts';

export const FIFA_VERSION = 16 as const;
export const FIFA_TABLES = Object.values(Table);

export const tableForName = (name: string): Table => {
  const normalized = name.trim().toLocaleLowerCase('en');
  const table = FIFA_TABLES.find((candidate) => candidate === normalized);
  if (!table) throw new Error(`Unsupported FIFA 16 table: ${name}`);
  return table;
};

export const fieldsFor = (tableName: string): Field[] =>
  [...fifaTableConfig(Fifa.Fifa16, tableForName(tableName))].sort(sortByOrder);

export const fieldFor = (tableName: string, fieldName: string): Field => {
  const normalized = fieldName.trim().toLocaleLowerCase('en');
  const field = fieldsFor(tableName).find((candidate) => candidate.name === normalized);
  if (!field) throw new Error(`Unsupported field ${fieldName} for table ${tableName}.`);
  return field;
};

export const fieldDescriptor = (field: Field): FieldDescriptor => ({
  name: field.name,
  type: field.type === Datatype.Int ? 'int' : field.type === Datatype.Float ? 'float' : 'string',
  defaultValue: typeof field.default === 'number' ? field.default : String(field.default ?? ''),
  unique: Boolean(field.unique),
  ...(field.range ? { range: { min: field.range.min, max: field.range.max } } : {}),
});

export const defaultValueFor = (field: Field): TableValue =>
  typeof field.default === 'number' ? field.default : String(field.default ?? '');

export const isSupportedTable = (table: string): boolean =>
  FIFA_TABLES.includes(table.toLocaleLowerCase('en') as Table);
