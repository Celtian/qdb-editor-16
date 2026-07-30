import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FIFA_TABLES, fieldsFor } from '../shared/table-config';
import { FifaDatabase } from './fifa-database';

const directories: string[] = [];

const createDatabase = (): { database: FifaDatabase; path: string } => {
  const directory = mkdtempSync(join(tmpdir(), 'qdb-editor-database-'));
  directories.push(directory);
  const path = join(directory, 'database.sqlite');
  return {
    path,
    database: FifaDatabase.create(path, {
      database_id: crypto.randomUUID(),
      project_id: crypto.randomUUID(),
      database_name: 'Test',
    }),
  };
};

afterEach(() =>
  Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  ),
);

describe('FIFA database', () => {
  it('creates every table and supports paginated transactional CRUD', () => {
    const { database } = createDatabase();
    expect(database.listTables().map((table) => table.name)).toEqual(FIFA_TABLES);

    const fields = fieldsFor('teams');
    const values = Object.fromEntries(
      fields.map((field) => [field.name, field.name === 'teamid' ? 42 : field.default]),
    );
    const inserted = database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'teams',
      values,
      acceptWarnings: true,
    });
    expect(inserted.row.values['teamid']).toBe(42);
    expect(
      database.readTable({
        databaseId: crypto.randomUUID(),
        table: 'teams',
        pageIndex: 0,
        pageSize: 25,
        query: '42',
      }),
    ).toMatchObject({ total: 1, rows: [{ rowId: inserted.row.rowId }] });

    const updated = database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'teams',
      rowId: inserted.row.rowId,
      values: { ...values, teamname: 'Edited' },
      acceptWarnings: true,
    });
    expect(updated.row.values['teamname']).toBe('Edited');
    expect(database.deleteRow('teams', inserted.row.rowId)).toBe(true);
    database.close();
  });

  it('blocks duplicate unique values and reports missing relationships', () => {
    const { database } = createDatabase();
    const playerFields = fieldsFor('players');
    const player = Object.fromEntries(
      playerFields.map((field) => [field.name, field.name === 'playerid' ? 1 : field.default]),
    );
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'players',
      values: player,
      acceptWarnings: true,
    });
    expect(() =>
      database.saveRow({
        databaseId: crypto.randomUUID(),
        table: 'players',
        values: player,
        acceptWarnings: true,
      }),
    ).toThrow(/unique/);

    const link = Object.fromEntries(
      fieldsFor('teamplayerlinks').map((field) => [
        field.name,
        field.name === 'playerid' || field.name === 'teamid' ? 999 : field.default,
      ]),
    );
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'teamplayerlinks',
      values: link,
      acceptWarnings: true,
    });
    const report = database.validate(crypto.randomUUID());
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'teamplayerlinks', field: 'playerid' }),
        expect.objectContaining({ table: 'teamplayerlinks', field: 'teamid' }),
      ]),
    );
    database.close();
  });

  it('can cooperatively cancel full validation before reports are persisted', () => {
    const { database } = createDatabase();
    let checkpoints = 0;

    expect(() =>
      database.validate(crypto.randomUUID(), () => {
        checkpoints += 1;
        if (checkpoints === 2) throw new Error('Operation cancelled.');
      }),
    ).toThrow(/cancelled/i);
    expect(checkpoints).toBe(2);
    database.close();
  });

  it('preserves invalid imported integers and blocks invalid integer edits', () => {
    const { database } = createDatabase();
    const values = Object.fromEntries(
      fieldsFor('teams').map((field) => [
        field.name,
        field.name === 'teamid' ? 1.5 : field.default,
      ]),
    );

    database.insertRows('teams', [values]);
    expect(database.readAllRows('teams')[0]?.values['teamid']).toBe(1.5);
    expect(database.validate(crypto.randomUUID()).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          table: 'teams',
          field: 'teamid',
        }),
      ]),
    );
    expect(() =>
      database.saveRow({
        databaseId: crypto.randomUUID(),
        table: 'teams',
        values,
        acceptWarnings: true,
      }),
    ).toThrow(/integer/i);
    database.close();
  });
});
