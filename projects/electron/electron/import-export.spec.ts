import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fieldsFor, FIFA_TABLES } from '../shared/table-config';
import { encodeFifaText, parseTextTable } from '../shared/text-format';
import { exportDatabase } from './database-exporter';
import { importDatabase } from './database-importer';
import { FifaDatabase } from './fifa-database';
import { inspectTextSource } from './source-inspection';

const roots: string[] = [];

afterEach(() =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

describe('database import and export', () => {
  it('imports a partial FIFA 16 folder and exports all supported tables', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qdb-editor-import-'));
    roots.push(root);
    const source = join(root, 'source');
    const target = join(root, 'target');
    await Promise.all([mkdir(source), mkdir(target)]);
    const fields = fieldsFor('teams');
    const values = Object.fromEntries(
      fields.map((field) => [field.name, field.name === 'teamid' ? 7 : field.default]),
    );
    await writeFile(
      join(source, 'teams.txt'),
      encodeFifaText(
        fields.map((field) => field.name),
        [values],
      ),
    );
    await writeFile(join(source, 'unsupported.txt'), encodeFifaText(['value'], [{ value: 'x' }]));
    const inspection = await inspectTextSource(source);
    expect(inspection.unsupportedTables).toEqual(['unsupported']);
    const databaseId = crypto.randomUUID();
    const path = join(root, 'database.sqlite');
    const imported = await importDatabase(
      databaseId,
      crypto.randomUUID(),
      'Imported',
      {
        selectionId: crypto.randomUUID(),
        inspection: { ...inspection, selectionId: crypto.randomUUID() },
      },
      path,
    );
    expect(imported.rowCount).toBe(1);

    const output = await exportDatabase(path, 'Imported', target);
    const files = (await import('node:fs/promises')).readdir(output);
    expect((await files).filter((file) => file.endsWith('.txt'))).toHaveLength(FIFA_TABLES.length);
    expect(parseTextTable(await readFile(join(output, 'teams.txt'))).rows).toHaveLength(1);
    expect(parseTextTable(await readFile(join(output, 'players.txt'))).rows).toEqual([]);
  });

  it('rejects a supported filename with non-FIFA-16 headers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qdb-editor-inspection-'));
    roots.push(root);
    await writeFile(join(root, 'teams.txt'), encodeFifaText(['wrong'], [{ wrong: 1 }]));
    await expect(inspectTextSource(root)).rejects.toThrow(/does not match/);
  });

  it('uses collision-safe export folders and cleans cancelled temporary output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qdb-editor-export-'));
    roots.push(root);
    const target = join(root, 'target');
    await mkdir(target);
    const path = join(root, 'database.sqlite');
    const databaseId = crypto.randomUUID();
    const database = FifaDatabase.create(path, {
      database_id: databaseId,
      project_id: crypto.randomUUID(),
      database_name: 'Career',
    });
    database.close();

    const first = await exportDatabase(path, 'Career', target);
    const second = await exportDatabase(path, 'Career', target);
    expect(second).not.toBe(first);
    await expect(
      exportDatabase(path, 'Cancelled', target, () => {
        throw new Error('Operation cancelled.');
      }),
    ).rejects.toThrow(/cancelled/i);
    expect((await readdir(target)).some((file) => file.endsWith('.exporting'))).toBe(false);
  });
});
