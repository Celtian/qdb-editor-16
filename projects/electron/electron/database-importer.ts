import { openFifaDatabase } from 'fifa-t3db';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SourceProvenance, TableRowValues, ValidationReport } from '../shared/contracts';
import { FIFA_TABLES } from '../shared/table-config';
import { parseTextTable } from '../shared/text-format';
import { FifaDatabase } from './fifa-database';
import type { SelectedSource } from './source-selections';

const hashFile = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const normalizeRow = (row: Readonly<Record<string, string | number>>): TableRowValues =>
  Object.fromEntries(
    Object.entries(row).map(([field, value]) => [field.toLocaleLowerCase('en'), value]),
  );

export interface ImportedDatabase {
  source: SourceProvenance;
  rowCount: number;
  report: ValidationReport;
}

export const importDatabase = async (
  databaseId: string,
  projectId: string,
  name: string,
  source: SelectedSource,
  outputPath: string,
  progress?: (message: string) => void,
  checkpoint?: () => void,
): Promise<ImportedDatabase> => {
  const hashes: Record<string, string> = {};
  const database = FifaDatabase.create(outputPath, {
    database_id: databaseId,
    project_id: projectId,
    database_name: name,
    fifa_version: '16',
    schema_version: '1',
    created_at: new Date().toISOString(),
    source_kind: source.inspection.sourceKind,
    source_paths: JSON.stringify(source.inspection.originalPaths),
    source_warnings: JSON.stringify(source.inspection.warnings),
  });
  let rowCount = 0;
  try {
    if (source.inspection.sourceKind === 'text-folder') {
      const root = source.inspection.originalPaths[0]!;
      for (const [index, table] of source.inspection.tables.entries()) {
        progress?.(`Importing ${table.table} (${index + 1}/${source.inspection.tables.length})…`);
        const path = join(root, `${table.table}.txt`);
        const parsed = parseTextTable(await readFile(path));
        database.insertRows(table.table, parsed.rows);
        hashes[`${table.table}.txt`] = await hashFile(path);
        rowCount += parsed.rows.length;
      }
    } else {
      const [databasePath, metadataPath] = source.inspection.originalPaths;
      if (!databasePath || !metadataPath) throw new Error('Both t3db source files are required.');
      const t3db = openFifaDatabase({
        database: await readFile(databasePath),
        metadataXml: await readFile(metadataPath, 'utf8'),
      });
      for (const [index, table] of source.inspection.tables.entries()) {
        progress?.(`Importing ${table.table} (${index + 1}/${source.inspection.tables.length})…`);
        const rows = t3db.readTable(table.table).rows.map(normalizeRow);
        database.insertRows(table.table, rows);
        rowCount += rows.length;
      }
      hashes[databasePath.split(/[\\/]/).at(-1) ?? 'database.db'] = await hashFile(databasePath);
      hashes[metadataPath.split(/[\\/]/).at(-1) ?? 'metadata.xml'] = await hashFile(metadataPath);
    }
    for (const table of FIFA_TABLES)
      if (!source.inspection.tables.some((candidate) => candidate.table === table))
        database.setMetadata(`missing_table_${table}`, 'true');
    progress?.('Validating imported database…');
    const report = database.validate(databaseId, checkpoint);
    return {
      source: {
        kind: source.inspection.sourceKind,
        originalPaths: source.inspection.originalPaths,
        hashes,
        importedAt: new Date().toISOString(),
      },
      rowCount,
      report,
    };
  } finally {
    database.close();
  }
};

export const createBlankDatabase = (
  databaseId: string,
  projectId: string,
  name: string,
  outputPath: string,
): ImportedDatabase => {
  const now = new Date().toISOString();
  const database = FifaDatabase.create(outputPath, {
    database_id: databaseId,
    project_id: projectId,
    database_name: name,
    fifa_version: '16',
    schema_version: '1',
    created_at: now,
    source_kind: 'blank',
  });
  try {
    const report = database.validate(databaseId);
    return {
      source: { kind: 'blank', originalPaths: [], hashes: {}, importedAt: now },
      rowCount: 0,
      report,
    };
  } finally {
    database.close();
  }
};
