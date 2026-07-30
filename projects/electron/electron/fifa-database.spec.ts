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
  const row = (table: string, overrides: Record<string, string | number>) =>
    Object.fromEntries(
      fieldsFor(table).map((field) => [field.name, overrides[field.name] ?? field.default]),
    );

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

  it('projects joined domain objects and keeps object and table edits consistent', () => {
    const { database } = createDatabase();
    database.saveObject({
      databaseId: crypto.randomUUID(),
      kind: 'countries',
      section: 'root',
      values: {
        nationid: 14,
        nationname: 'Czech Republic',
        confederation: 7,
        isocountrycode: 'cz',
      },
      acceptWarnings: true,
    });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'playernames',
      values: row('playernames', { nameid: 100, name: 'Petr' }),
      acceptWarnings: true,
    });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'playernames',
      values: row('playernames', { nameid: 101, name: 'Čech' }),
      acceptWarnings: true,
    });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'players',
      values: row('players', {
        playerid: 1,
        firstnameid: 100,
        lastnameid: 101,
        nationality: 14,
      }),
      acceptWarnings: true,
    });

    expect(
      database.listObjects({
        databaseId: crypto.randomUUID(),
        kind: 'players',
        pageIndex: 0,
        pageSize: 25,
        query: 'Petr',
        sortField: 'name',
        sortDirection: 'asc',
      }),
    ).toMatchObject({
      total: 1,
      items: [{ id: 1, name: 'Petr Čech', values: { country: 'Czech Republic' } }],
    });

    database.saveObject({
      databaseId: crypto.randomUUID(),
      kind: 'players',
      id: 1,
      section: 'identity',
      values: { height: 197, weight: 90 },
      acceptWarnings: true,
    });
    expect(
      database.readAllRows('players').find((candidate) => candidate.values['playerid'] === 1)
        ?.values['height'],
    ).toBe(197);
    database.close();
  });

  it('blocks object deletion when relationship rows still depend on it', () => {
    const { database } = createDatabase();
    database.saveObject({
      databaseId: crypto.randomUUID(),
      kind: 'teams',
      section: 'root',
      values: { teamid: 42, teamname: 'Sparta Prague' },
      acceptWarnings: true,
    });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'players',
      values: row('players', { playerid: 7 }),
      acceptWarnings: true,
    });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'teamplayerlinks',
      values: row('teamplayerlinks', {
        artificialkey: 1,
        teamid: 42,
        playerid: 7,
        jerseynumber: 1,
      }),
      acceptWarnings: true,
    });

    expect(
      database.deleteObject({
        databaseId: crypto.randomUUID(),
        kind: 'teams',
        id: 42,
      }),
    ).toEqual({
      deleted: false,
      dependencies: [
        expect.objectContaining({ table: 'teamplayerlinks', field: 'teamid', count: 1 }),
      ],
    });
    expect(
      database.listObjects({
        databaseId: crypto.randomUUID(),
        kind: 'teams',
        pageIndex: 0,
        pageSize: 25,
        query: '',
      }).total,
    ).toBe(1);
    database.close();
  });

  it('preserves player-team metadata and allocates collision-free relationship keys', () => {
    const { database } = createDatabase();
    for (const [teamid, teamname] of [
      [1, 'Home'],
      [2, 'Away'],
    ] as const)
      database.saveObject({
        databaseId: crypto.randomUUID(),
        kind: 'teams',
        section: 'root',
        values: { teamid, teamname },
        acceptWarnings: true,
      });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'players',
      values: row('players', { playerid: 9 }),
      acceptWarnings: true,
    });
    database.saveRow({
      databaseId: crypto.randomUUID(),
      table: 'teamplayerlinks',
      values: row('teamplayerlinks', {
        artificialkey: 10,
        teamid: 1,
        playerid: 9,
        jerseynumber: 33,
      }),
      acceptWarnings: true,
    });

    database.saveObject({
      databaseId: crypto.randomUUID(),
      kind: 'players',
      id: 9,
      section: 'contract',
      values: { contractvaliduntil: 2020, playerjointeamdate: 150000 },
      relationIds: [1, 2],
      acceptWarnings: true,
    });

    expect(
      database
        .readAllRows('teamplayerlinks')
        .filter((candidate) => candidate.values['playerid'] === 9)
        .map((candidate) => candidate.values)
        .sort((left, right) => Number(left['teamid']) - Number(right['teamid'])),
    ).toMatchObject([
      { artificialkey: 10, teamid: 1, jerseynumber: 33 },
      { artificialkey: 11, teamid: 2 },
    ]);
    database.close();
  });

  it('rejects unavailable object sections and read-only object mutations', () => {
    const { database } = createDatabase();
    database.saveObject({
      databaseId: crypto.randomUUID(),
      kind: 'countries',
      section: 'root',
      values: { nationid: 14, nationname: 'Czech Republic' },
      acceptWarnings: true,
    });

    expect(() =>
      database.readObject({
        databaseId: crypto.randomUUID(),
        kind: 'countries',
        id: 14,
        section: 'identity',
      }),
    ).toThrow(/invalid countries object section/i);
    expect(() =>
      database.saveObject({
        databaseId: crypto.randomUUID(),
        kind: 'stadiums',
        id: 1,
        section: 'root',
        values: { stadiumid: 1, name: 'Read only' },
        acceptWarnings: true,
      }),
    ).toThrow(/not available/i);
    database.close();
  });
});
