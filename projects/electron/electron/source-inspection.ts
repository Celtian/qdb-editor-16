import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { openFifaDatabase } from 'fifa-t3db';
import type { ImportCandidate } from '../shared/contracts';
import { fieldsFor, FIFA_TABLES, isSupportedTable } from '../shared/table-config';
import { parseTextTable } from '../shared/text-format';

type Inspection = Omit<ImportCandidate, 'selectionId'>;

const sameFields = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length &&
  new Set(actual).size === expected.length &&
  actual.every((field) => expected.includes(field));

export const inspectTextSource = async (path: string): Promise<Inspection> => {
  const files = (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && extname(entry.name).toLocaleLowerCase('en') === '.txt')
    .map((entry) => entry.name);
  if (!files.length) throw new Error('The selected folder contains no .txt table files.');

  const tables: { table: string; rows: number }[] = [];
  const unsupportedTables: string[] = [];
  for (const file of files) {
    const table = file.slice(0, -4).toLocaleLowerCase('en');
    if (!isSupportedTable(table)) {
      unsupportedTables.push(table);
      continue;
    }
    const parsed = parseTextTable(await readFile(join(path, file)));
    const expected = fieldsFor(table).map((field) => field.name);
    if (!sameFields(parsed.headers, expected))
      throw new Error(`${file} does not match the FIFA 16 ${table} schema.`);
    tables.push({ table, rows: parsed.rows.length });
  }
  if (!tables.length) throw new Error('The folder contains no supported FIFA 16 tables.');
  tables.sort((left, right) => left.table.localeCompare(right.table, 'en'));
  unsupportedTables.sort((left, right) => left.localeCompare(right, 'en'));
  return {
    suggestedName: basename(path),
    sourceKind: 'text-folder',
    originalPaths: [path],
    tables,
    unsupportedTables,
    warnings: unsupportedTables.length
      ? [`${unsupportedTables.length} unsupported table files will be ignored.`]
      : [],
  };
};

export const inspectT3dbSource = async (
  databasePath: string,
  metadataPath: string,
): Promise<Inspection> => {
  const database = openFifaDatabase({
    database: await readFile(databasePath),
    metadataXml: await readFile(metadataPath, 'utf8'),
  });
  const schema = new Map(
    database.schema.tables.map((table) => [
      table.name.toLocaleLowerCase('en'),
      table.fields.map((field) => field.name.toLocaleLowerCase('en')),
    ]),
  );
  const tableRows = new Map(
    database
      .listTables()
      .map((table) => [table.name.toLocaleLowerCase('en'), table.validRecordCount]),
  );
  const tables: { table: string; rows: number }[] = [];
  for (const table of FIFA_TABLES) {
    const headers = schema.get(table);
    if (!headers) continue;
    const expected = fieldsFor(table).map((field) => field.name);
    if (!sameFields(headers, expected))
      throw new Error(`The t3db ${table} schema does not match FIFA 16.`);
    tables.push({ table, rows: tableRows.get(table) ?? 0 });
  }
  if (!tables.length) throw new Error('The t3db source contains no supported FIFA 16 tables.');
  const unsupportedTables = [...schema.keys()]
    .filter((table) => !isSupportedTable(table))
    .sort((left, right) => left.localeCompare(right, 'en'));
  return {
    suggestedName: basename(databasePath, extname(databasePath)),
    sourceKind: 't3db',
    originalPaths: [databasePath, metadataPath],
    tables,
    unsupportedTables,
    warnings: unsupportedTables.length
      ? [`${unsupportedTables.length} unsupported t3db tables will be ignored.`]
      : [],
  };
};
