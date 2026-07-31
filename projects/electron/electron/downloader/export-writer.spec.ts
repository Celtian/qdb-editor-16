import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  CombinedLeague,
  CombinedPlayer,
  CombinedTeam,
  ExportColumnSelection,
  ExportFieldNameConfiguration,
  ExportFormat,
  League,
  Player,
  Project,
  Team,
} from '../../shared/downloader/contracts.js';
import {
  camelCaseExportFieldNames,
  createExportFieldNames,
} from '../../shared/downloader/export-schema.js';
import type { SnapshotDatabase } from './database.js';
import { SnapshotExportWriter } from './export-writer.js';

const now = '2026-01-01T00:00:00.000Z';
const project: Project = {
  id: 'project',
  name: 'Winter snapshot',
  referenceDate: '2026-01-01',
  createdAt: now,
  updatedAt: now,
};
const leagues: League[] = [
  {
    id: 'league-1',
    projectId: project.id,
    sourceName: 'transfermarkt',
    sourceId: 'GB1',
    name: 'Premier League',
    countryName: 'England',
    countryCode2: 'GB',
    countryCode3: 'ENG',
    sourceUrl: 'https://example.test/GB1',
    createdAt: now,
    updatedAt: now,
    customBadges: [],
  },
  {
    id: 'league-2',
    projectId: project.id,
    sourceName: 'transfermarkt',
    sourceId: 'GB2',
    name: 'Championship',
    sourceUrl: 'https://example.test/GB2',
    createdAt: now,
    updatedAt: now,
    customBadges: [],
  },
];
const teams: Team[] = leagues.map((league, index) => ({
  id: `team-${index + 1}`,
  projectId: project.id,
  leagueId: league.id,
  sourceName: 'transfermarkt',
  sourceId: String(index + 1),
  name: `Team ${index + 1}`,
  ...(index === 0 && {
    countryName: 'England',
    countryCode2: 'GB',
    countryCode3: 'ENG',
  }),
  sourceUrl: `https://example.test/team-${index + 1}`,
  createdAt: now,
  updatedAt: now,
  customBadges: [],
}));
teams.push({
  id: 'team-unassigned',
  projectId: project.id,
  sourceName: 'transfermarkt',
  sourceId: 'unassigned',
  name: 'Unassigned Team',
  sourceUrl: 'https://example.test/team-unassigned',
  createdAt: now,
  updatedAt: now,
  customBadges: [],
});
const players: Player[] = teams.map((team, index) => ({
  id: `player-${index + 1}`,
  projectId: project.id,
  teamId: team.id,
  sourceName: 'transfermarkt',
  sourceId: `player-${index + 1}`,
  name: `Player ${index + 1}`,
  positionDetail: index === 0 ? 'ST' : undefined,
  weight: index === 0 ? 82 : undefined,
  createdAt: now,
  updatedAt: now,
  customBadges: [],
}));

const exportColumns = (
  leagues: ExportColumnSelection['leagues'],
  teams: ExportColumnSelection['teams'],
  players: ExportColumnSelection['players'],
): ExportColumnSelection => ({ leagues, teams, players });

const renamedFieldNames = (
  renames: Partial<Record<'leagues' | 'teams' | 'players', Readonly<Record<string, string>>>> = {},
): ExportFieldNameConfiguration => {
  const fieldNames = camelCaseExportFieldNames();
  for (const entity of ['leagues', 'teams', 'players'] as const) {
    for (const mapping of fieldNames[entity]) {
      mapping.outputName = renames[entity]?.[mapping.sourceKey] ?? mapping.outputName;
    }
  }
  return fieldNames;
};

describe('SnapshotExportWriter', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  test('exports only selected leagues and columns', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'qdb-export-test-'));
    directories.push(destination);
    const database = {
      exportRows: vi.fn(() => ({ leagues, teams, players })),
    } as unknown as SnapshotDatabase;
    const writer = new SnapshotExportWriter(database);
    const columns = exportColumns(
      ['name', 'countryName', 'countryCode3'],
      ['name', 'countryName', 'countryCode3'],
      ['name', 'positionDetail', 'weight'],
    );
    const fieldNames = renamedFieldNames({
      leagues: { name: 'league_name' },
      teams: { name: 'team_name' },
      players: { name: 'player_name' },
    });

    const result = await writer.write(project, {
      projectId: project.id,
      format: 'json',
      destination,
      includeTeamsWithoutLeague: true,
      leagueIds: ['league-1'],
      columns,
      fieldNames,
    });
    const files = new Map(result.files.map((file) => [file.split('/').at(-1), file]));
    const leagueRows = JSON.parse(
      await readFile(files.get('leagues.json') ?? '', 'utf8'),
    ) as unknown;
    const teamRows = JSON.parse(await readFile(files.get('teams.json') ?? '', 'utf8')) as unknown;
    const playerRows = JSON.parse(
      await readFile(files.get('players.json') ?? '', 'utf8'),
    ) as unknown;

    expect(leagueRows).toEqual([
      { league_name: 'Premier League', countryName: 'England', countryCode3: 'ENG' },
    ]);
    expect(teamRows).toEqual([
      { team_name: 'Team 1', countryName: 'England', countryCode3: 'ENG' },
      { team_name: 'Unassigned Team' },
    ]);
    expect(playerRows).toEqual([
      { player_name: 'Player 1', positionDetail: 'ST', weight: 82 },
      { player_name: 'Player 3' },
    ]);
  });

  test('keeps CSV as three independent entity files', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'qdb-export-test-'));
    directories.push(destination);
    const database = {
      exportRows: vi.fn(() => ({ leagues, teams, players })),
    } as unknown as SnapshotDatabase;
    const writer = new SnapshotExportWriter(database);
    const columns = exportColumns(['name'], ['name'], ['name']);
    const fieldNames = renamedFieldNames({
      leagues: { name: 'league_name' },
      teams: { name: 'team_name' },
      players: { name: 'player_name' },
    });

    const result = await writer.write(project, {
      projectId: project.id,
      format: 'csv',
      destination,
      includeTeamsWithoutLeague: false,
      leagueIds: ['league-1'],
      columns,
      fieldNames,
    });
    const files = new Map(result.files.map((file) => [file.split('/').at(-1), file]));

    expect([...files.keys()]).toEqual(['leagues.csv', 'teams.csv', 'players.csv']);
    await expect(readFile(files.get('leagues.csv') ?? '', 'utf8')).resolves.toBe(
      '\uFEFFleague_name\r\nPremier League\r\n',
    );
    await expect(readFile(files.get('teams.csv') ?? '', 'utf8')).resolves.toBe(
      '\uFEFFteam_name\r\nTeam 1\r\n',
    );
    await expect(readFile(files.get('players.csv') ?? '', 'utf8')).resolves.toBe(
      '\uFEFFplayer_name\r\nPlayer 1\r\n',
    );
  });

  test('keeps export headers in schema order when selected keys arrive out of order', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'qdb-export-test-'));
    directories.push(destination);
    const database = {
      exportRows: vi.fn(() => ({ leagues, teams, players })),
    } as unknown as SnapshotDatabase;
    const writer = new SnapshotExportWriter(database);

    const result = await writer.write(project, {
      projectId: project.id,
      format: 'csv',
      destination,
      includeTeamsWithoutLeague: false,
      leagueIds: ['league-1'],
      columns: exportColumns(['countryName', 'name'], ['name'], ['name']),
      fieldNames: camelCaseExportFieldNames(),
    });
    const leaguePath = result.files.find((file) => file.endsWith('leagues.csv')) ?? '';

    await expect(readFile(leaguePath, 'utf8')).resolves.toBe(
      '\uFEFFname,countryName\r\nPremier League,England\r\n',
    );
  });

  test('writes one nested JSON snapshot after filtering and before projecting columns', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'qdb-export-test-'));
    directories.push(destination);
    const teamWithoutPlayers: Team = {
      ...teams[0],
      id: 'team-empty',
      sourceId: 'empty',
      name: 'Empty Team',
      sourceUrl: 'https://example.test/team-empty',
    };
    const database = {
      exportRows: vi.fn(() => ({ leagues, teams: [...teams, teamWithoutPlayers], players })),
    } as unknown as SnapshotDatabase;
    const writer = new SnapshotExportWriter(database);
    const columns = exportColumns(['name'], ['name'], ['name', 'positionDetail']);
    const fieldNames = renamedFieldNames({
      leagues: { name: 'league_name' },
      teams: { name: 'team_name' },
      players: { name: 'player_name' },
    });

    const result = await writer.write(project, {
      projectId: project.id,
      format: 'single-json',
      destination,
      includeTeamsWithoutLeague: true,
      leagueIds: ['league-1'],
      columns,
      fieldNames,
    });

    expect(result.files).toEqual([join(result.directory, 'snapshot.json')]);
    const snapshot = JSON.parse(await readFile(result.files[0], 'utf8')) as unknown;
    expect(snapshot).toEqual({
      project: {
        name: 'Winter snapshot',
        referenceDate: '2026-01-01',
      },
      leagues: [{ league_name: 'Premier League' }],
      teams: [
        {
          team_name: 'Team 1',
          players: [{ player_name: 'Player 1', positionDetail: 'ST' }],
        },
        {
          team_name: 'Unassigned Team',
          players: [{ player_name: 'Player 3' }],
        },
        {
          team_name: 'Empty Team',
          players: [],
        },
      ],
    });
  });

  test('exports canonical provenance as JSON collections and flattened CSV columns', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'qdb-export-test-'));
    directories.push(destination);
    const sources = [
      {
        sourceName: 'transfermarkt' as const,
        sourceId: '281',
        name: 'Team',
        available: true,
      },
      {
        sourceName: 'soccerway' as const,
        sourceId: 'team/abc',
        name: 'Team',
        available: true,
      },
    ];
    const combinedLeague: CombinedLeague = {
      id: 'combined-league',
      projectId: project.id,
      name: 'Combined League',
      sources,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };
    const combinedTeam: CombinedTeam = {
      id: 'combined-team',
      projectId: project.id,
      leagueId: combinedLeague.id,
      name: 'Combined Team',
      sources,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };
    const combinedPlayer: CombinedPlayer = {
      id: 'combined-player',
      projectId: project.id,
      teamId: combinedTeam.id,
      name: 'Combined Player',
      weight: 79,
      sources,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };
    const database = {
      exportCombinedRows: vi.fn(() => ({
        leagues: [combinedLeague],
        teams: [combinedTeam],
        players: [combinedPlayer],
      })),
    } as unknown as SnapshotDatabase;
    const writer = new SnapshotExportWriter(database);

    const json = await writer.write(project, {
      projectId: project.id,
      dataset: 'combined',
      format: 'json',
      destination,
      includeTeamsWithoutLeague: false,
      leagueIds: [combinedLeague.id],
      columns: exportColumns(['name'], ['name'], ['name', 'weight']),
      fieldNames: camelCaseExportFieldNames(),
    });
    const jsonTeamPath = json.files.find((file) => file.endsWith('teams.json')) ?? '';
    expect(JSON.parse(await readFile(jsonTeamPath, 'utf8'))).toEqual([
      { name: 'Combined Team', sources },
    ]);
    const jsonPlayerPath = json.files.find((file) => file.endsWith('players.json')) ?? '';
    expect(JSON.parse(await readFile(jsonPlayerPath, 'utf8'))).toEqual([
      { name: 'Combined Player', weight: 79, sources },
    ]);

    const csv = await writer.write(project, {
      projectId: project.id,
      dataset: 'combined',
      format: 'csv',
      destination,
      includeTeamsWithoutLeague: false,
      leagueIds: [combinedLeague.id],
      columns: exportColumns(['name'], ['name'], ['name', 'weight']),
      fieldNames: camelCaseExportFieldNames(),
    });
    const csvTeamPath = csv.files.find((file) => file.endsWith('teams.csv')) ?? '';
    await expect(readFile(csvTeamPath, 'utf8')).resolves.toContain(
      'name,sourceNames,sourceIds\r\nCombined Team,transfermarkt;soccerway,281;team/abc',
    );
    const csvPlayerPath = csv.files.find((file) => file.endsWith('players.csv')) ?? '';
    await expect(readFile(csvPlayerPath, 'utf8')).resolves.toContain(
      'name,weight,sourceNames,sourceIds\r\nCombined Player,79,transfermarkt;soccerway,281;team/abc',
    );
  });

  test('rejects unsupported export formats', async () => {
    const destination = await mkdtemp(join(tmpdir(), 'qdb-export-test-'));
    directories.push(destination);
    const database = {
      exportRows: vi.fn(() => ({ leagues, teams, players })),
    } as unknown as SnapshotDatabase;
    const writer = new SnapshotExportWriter(database);

    await expect(
      writer.write(project, {
        projectId: project.id,
        format: 'xml' as ExportFormat,
        destination,
        includeTeamsWithoutLeague: true,
        leagueIds: ['league-1'],
        columns: exportColumns(['name'], ['name'], ['name']),
        fieldNames: createExportFieldNames('camelCase'),
      }),
    ).rejects.toMatchObject({
      appError: { code: 'INVALID_INPUT', message: 'Choose a valid export format.' },
    });
  });
});
