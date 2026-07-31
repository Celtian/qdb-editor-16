import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  CombinedLeague,
  CombinedPlayer,
  CombinedTeam,
  CommitImportRequest,
  League,
  Player,
  SourceName,
  Team,
} from '../../shared/downloader/contracts.js';
import {
  camelCaseExportFieldNames,
  defaultExportColumns,
} from '../../shared/downloader/export-schema.js';
import { SnapshotDatabase } from './database.js';
import { ApplicationError } from './errors.js';

const directories: string[] = [];

const createDatabasePath = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'qdb-downloader-test-'));
  directories.push(directory);
  return join(directory, 'snapshot.sqlite');
};

const createDatabase = (): SnapshotDatabase => new SnapshotDatabase(createDatabasePath());

const mergeOperation = () =>
  ({
    kind: 'merge',
    options: {
      existingRecords: 'refresh',
      teamLeagueConflicts: 'move',
      playerTeamConflicts: 'move',
    },
  }) as const;

afterEach(() => {
  while (directories.length) {
    const directory = directories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('SnapshotDatabase', () => {
  test('transactionally migrates the legacy schema and preserves IDs, links, dates, and seasons', () => {
    const path = createDatabasePath();
    const legacyDatabase = new DatabaseSync(path);
    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations VALUES
        (1, '2025-01-01T00:00:00.000Z'),
        (2, '2025-01-02T00:00:00.000Z');
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        reference_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE leagues (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK(source = 'transfermarkt'),
        external_id TEXT NOT NULL,
        name TEXT NOT NULL,
        season TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, source, external_id, season)
      ) STRICT;
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        league_id TEXT REFERENCES leagues(id) ON DELETE SET NULL,
        source TEXT NOT NULL CHECK(source = 'transfermarkt'),
        external_id TEXT NOT NULL,
        name TEXT NOT NULL,
        season TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, source, external_id, season)
      ) STRICT;
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK(source = 'transfermarkt'),
        external_id TEXT NOT NULL,
        name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        jersey_number INTEGER,
        position TEXT,
        birthdate TEXT,
        height REAL,
        weight REAL,
        foot TEXT,
        joined TEXT,
        contract_expires TEXT,
        market_value REAL,
        country_name TEXT,
        country_code2 TEXT,
        country_code3 TEXT,
        minutes_played INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, team_id, source, external_id)
      ) STRICT;
      CREATE INDEX players_project_external
        ON players(project_id, source, external_id);
      INSERT INTO projects VALUES (
        'project-legacy', 'Legacy schema', '2026-01-01',
        '2025-01-01T00:00:00.000Z', '2025-01-04T00:00:00.000Z'
      );
      INSERT INTO leagues VALUES (
        'league-legacy', 'project-legacy', 'transfermarkt', 'GB1',
        'Premier League', '2026', 'https://legacy.test/league',
        '2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z'
      );
      INSERT INTO teams VALUES (
        'team-legacy', 'project-legacy', 'league-legacy', 'transfermarkt', '281',
        'Manchester City', '2026', 'https://legacy.test/team',
        '2025-01-02T00:00:00.000Z', '2025-01-03T00:00:00.000Z'
      );
      INSERT INTO players(
        id, project_id, team_id, source, external_id, name, created_at, updated_at
      ) VALUES (
        'player-legacy', 'project-legacy', 'team-legacy', 'transfermarkt', '10',
        'Legacy player', '2025-01-03T00:00:00.000Z', '2025-01-04T00:00:00.000Z'
      );
    `);
    legacyDatabase.close();

    const database = new SnapshotDatabase(path);
    expect(
      database.getEntity({
        projectId: 'project-legacy',
        entity: 'leagues',
        id: 'league-legacy',
      }),
    ).toMatchObject({
      sourceName: 'transfermarkt',
      sourceId: 'GB1',
      tier: undefined,
      season: '2026',
      sourceUrl: 'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1/plus?saison_id=2026',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    });
    expect(
      database.getEntity({
        projectId: 'project-legacy',
        entity: 'teams',
        id: 'team-legacy',
      }),
    ).toMatchObject({ leagueId: 'league-legacy', sourceName: 'transfermarkt', sourceId: '281' });
    const legacyPlayer = database.listEntities({
      projectId: 'project-legacy',
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    expect(legacyPlayer).toMatchObject({
      id: 'player-legacy',
      teamId: 'team-legacy',
      sourceName: 'transfermarkt',
      sourceId: '10',
      name: 'Legacy player',
      positionDetail: undefined,
    });

    database.commitImport({
      projectId: 'project-legacy',
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      teams: [
        {
          sourceId: '281',
          name: 'Team',
          season: '2026',
          sourceUrl: 'https://example.test/team',
          players: [{ sourceId: 'fresh', name: 'Fresh player', positionDetail: 'ST' }],
        },
      ],
    });
    expect(
      database.listEntities({
        projectId: 'project-legacy',
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: 'Fresh',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({ name: 'Fresh player', positionDetail: 'ST' });

    database.close();
    const migratedDatabase = new DatabaseSync(path);
    const leagueColumns = migratedDatabase.prepare('PRAGMA table_info(leagues)').all() as {
      name: string;
    }[];
    const teamColumns = migratedDatabase.prepare('PRAGMA table_info(teams)').all() as {
      name: string;
    }[];
    expect(leagueColumns.map(({ name }) => name)).toContain('source_name');
    expect(leagueColumns.map(({ name }) => name)).toContain('source_id');
    expect(leagueColumns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['country_name', 'country_code2', 'country_code3']),
    );
    expect(leagueColumns.map(({ name }) => name)).not.toContain('source_url');
    expect(leagueColumns.map(({ name }) => name)).not.toContain('external_id');
    expect(teamColumns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['country_name', 'country_code2', 'country_code3']),
    );
    expect(
      migratedDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get(),
    ).toMatchObject({ version: 13 });
    migratedDatabase.close();
  });

  test('combines teams across providers and preserves canonical data after source deletion', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Combined', referenceDate: '2026-07-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'tm-league',
        name: 'Ceska Liga',
        sourceUrl: 'league',
      },
      teams: [
        {
          sourceId: 'tm-team',
          name: 'Cesky Team',
          sourceUrl: 'team',
          players: [
            {
              sourceId: 'tm-player',
              name: 'Ondrej Kolar',
              firstName: 'Ondrej',
              lastName: 'Kolar',
              birthdate: '1994-10-17',
              height: 193,
            },
          ],
        },
      ],
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'soccerway',
      operation: mergeOperation(),
      league: {
        sourceId: 'sw-league',
        name: 'Česká Liga',
        sourceUrl: 'league',
      },
      teams: [
        {
          sourceId: 'sw-team',
          name: 'Český Team',
          sourceUrl: 'team',
          players: [
            {
              sourceId: 'sw-player',
              name: 'Ondřej Kolář',
              firstName: 'Ondřej',
              lastName: 'Kolář',
              birthdate: '1994-10-17',
              height: 192,
            },
          ],
        },
      ],
    });
    const candidates = database.listCombineTeamCandidates({
      projectId: project.id,
      search: '',
    });
    const preview = database.previewTeamCombination({
      projectId: project.id,
      sourceTeamIds: candidates.map(({ id }) => id),
    });
    expect(preview.matchGroups).toHaveLength(1);
    expect(preview.matchGroups[0].players).toHaveLength(2);

    const result = database.commitTeamCombination({
      projectId: project.id,
      sourceTeamIds: candidates.map(({ id }) => id),
      league: {
        kind: 'create',
        sourceLeagueIds: preview.sourceLeagues.map(({ id }) => id),
        resolutions: {},
      },
      matchGroups: preview.matchGroups,
      selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
      teamResolutions: {},
      playerResolutions: {},
    });
    expect(result.team).toMatchObject({
      name: 'Český Team',
      needsReview: false,
    });
    expect(result.league).toMatchObject({ name: 'Česká Liga' });
    expect(result.team.sources).toHaveLength(2);
    expect(result.players).toEqual([
      expect.objectContaining({
        name: 'Ondřej Kolář',
        firstName: 'Ondřej',
        lastName: 'Kolář',
        height: 193,
      }),
    ]);
    expect(database.getProjectSummary(project.id)).toMatchObject({
      combinedLeagueCount: 1,
      combinedTeamCount: 1,
      combinedPlayerCount: 1,
    });

    database.deleteSourceData({
      projectId: project.id,
      sourceNames: ['transfermarkt'],
    });
    const combinedTeams = database.listCombinedEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    });
    expect(combinedTeams.rows).toEqual([
      expect.objectContaining({
        name: 'Český Team',
        needsReview: true,
        sources: expect.arrayContaining([
          expect.objectContaining({ sourceName: 'transfermarkt', available: false }),
        ]),
      }),
    ]);
    database.close();
  });

  test('validates selected player groups and removes deselected canonical players on recombine', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Selected combined players',
      referenceDate: '2026-07-01',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'tm-selected-league',
        name: 'Selected League',
        sourceUrl: 'league',
      },
      teams: [
        {
          sourceId: 'tm-selected-team',
          name: 'Selected Team',
          sourceUrl: 'team',
          players: [
            {
              sourceId: 'tm-selected-one',
              name: 'Selected One',
              birthdate: '2000-01-01',
            },
            {
              sourceId: 'tm-selected-two',
              name: 'Selected Two',
            },
          ],
        },
      ],
    });
    const sourceTeam = database.listCombineTeamCandidates({
      projectId: project.id,
      sourceName: 'transfermarkt',
      search: 'Selected Team',
    })[0];
    const preview = database.previewTeamCombination({
      projectId: project.id,
      sourceTeamIds: [sourceTeam.id],
    });
    const groupIds = preview.matchGroups.map(({ id }) => id);
    const commit = (selectedPlayerGroupIds: string[]) =>
      database.commitTeamCombination({
        projectId: project.id,
        sourceTeamIds: [sourceTeam.id],
        league: { kind: 'none' },
        matchGroups: preview.matchGroups,
        selectedPlayerGroupIds,
        teamResolutions: {},
        playerResolutions: {},
      });

    expect(() => commit([])).toThrow('Select at least one project player.');
    expect(() => commit([groupIds[0], 'unknown-group'])).toThrow(
      'Selected player groups are invalid.',
    );
    expect(() => commit([groupIds[0], groupIds[0]])).toThrow('Selected player groups are invalid.');

    const imported = commit(groupIds);
    expect(imported.players).toHaveLength(2);
    expect(imported.addedPlayers).toBe(2);

    const recombinePreview = database.previewTeamCombination({
      projectId: project.id,
      combinedTeamId: imported.team.id,
      sourceTeamIds: [sourceTeam.id],
    });
    const retainedGroupId = recombinePreview.matchGroups[0].id;
    const recombined = database.commitTeamCombination({
      projectId: project.id,
      combinedTeamId: imported.team.id,
      sourceTeamIds: [sourceTeam.id],
      league: { kind: 'none' },
      matchGroups: recombinePreview.matchGroups,
      selectedPlayerGroupIds: [retainedGroupId],
      teamResolutions: {},
      playerResolutions: {},
    });

    expect(recombined.players).toHaveLength(1);
    expect(recombined.addedPlayers).toBe(0);
    expect(recombined.updatedPlayers).toBe(1);
    expect(recombined.deletedPlayers).toBe(1);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).total,
    ).toBe(2);
    database.close();
  });

  test('imports one source team into combined data and later recombines it', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Single-source combined import',
      referenceDate: '2026-07-01',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'tm-league',
        name: 'Czech First League',
        sourceUrl: 'tm-league-url',
      },
      teams: [
        {
          sourceId: 'tm-team',
          name: 'Solo Team',
          sourceUrl: 'tm-team-url',
          players: [
            {
              sourceId: 'tm-player',
              name: 'Player One',
              birthdate: '2000-01-01',
              height: 180,
            },
          ],
        },
      ],
    });

    const transfermarktTeam = database.listCombineTeamCandidates({
      projectId: project.id,
      sourceName: 'transfermarkt',
      search: 'Solo Team',
    })[0];
    const preview = database.previewTeamCombination({
      projectId: project.id,
      sourceTeamIds: [transfermarktTeam.id],
    });
    expect(preview.sourceTeams).toEqual([
      expect.objectContaining({ id: transfermarktTeam.id, sourceName: 'transfermarkt' }),
    ]);
    expect(preview.matchGroups).toEqual([
      expect.objectContaining({
        automatic: false,
        players: [expect.objectContaining({ sourceId: 'tm-player' })],
      }),
    ]);

    const imported = database.commitTeamCombination({
      projectId: project.id,
      sourceTeamIds: [transfermarktTeam.id],
      league: {
        kind: 'create',
        sourceLeagueIds: preview.sourceLeagues.map(({ id }) => id),
        resolutions: {},
      },
      matchGroups: preview.matchGroups,
      selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
      teamResolutions: {},
      playerResolutions: {},
    });
    expect(imported.team).toMatchObject({
      name: 'Solo Team',
      needsReview: false,
      sources: [expect.objectContaining({ sourceName: 'transfermarkt', available: true })],
    });
    expect(imported.league).toMatchObject({
      name: 'Czech First League',
      sources: [expect.objectContaining({ sourceName: 'transfermarkt', available: true })],
    });
    expect(imported.players).toEqual([
      expect.objectContaining({
        name: 'Player One',
        sources: [expect.objectContaining({ sourceName: 'transfermarkt', available: true })],
      }),
    ]);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }),
    ).toMatchObject({ total: 1 });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }),
    ).toMatchObject({ total: 1 });
    expect(() =>
      database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds: [transfermarktTeam.id],
      }),
    ).toThrow('already belongs to Solo Team');
    if (!imported.league || !imported.players[0]) {
      throw new Error('Expected the source league and player to be imported.');
    }

    database.commitImport({
      projectId: project.id,
      sourceName: 'soccerway',
      operation: mergeOperation(),
      league: {
        sourceId: 'sw-league',
        name: 'Czech First League',
        sourceUrl: 'sw-league-url',
      },
      teams: [
        {
          sourceId: 'sw-team',
          name: 'Solo Team',
          sourceUrl: 'sw-team-url',
          players: [
            {
              sourceId: 'sw-player',
              name: 'Player One',
              birthdate: '2000-01-01',
              height: 181,
            },
          ],
        },
      ],
    });
    const soccerwayTeam = database.listCombineTeamCandidates({
      projectId: project.id,
      sourceName: 'soccerway',
      search: 'Solo Team',
    })[0];
    const recombinePreview = database.previewTeamCombination({
      projectId: project.id,
      combinedTeamId: imported.team.id,
      sourceTeamIds: [transfermarktTeam.id, soccerwayTeam.id],
    });
    const matchedPlayers = [
      {
        ...recombinePreview.matchGroups[0],
        players: recombinePreview.matchGroups.flatMap(({ players }) => players),
        automatic: false,
      },
    ];
    const recombined = database.commitTeamCombination({
      projectId: project.id,
      combinedTeamId: imported.team.id,
      sourceTeamIds: [transfermarktTeam.id, soccerwayTeam.id],
      league: { kind: 'existing', combinedLeagueId: imported.league.id },
      matchGroups: matchedPlayers,
      selectedPlayerGroupIds: matchedPlayers.map(({ id }) => id),
      teamResolutions: {},
      playerResolutions: {},
    });
    expect(recombined.team.id).toBe(imported.team.id);
    expect(recombined.team.sources).toHaveLength(2);
    expect(recombined.players).toEqual([
      expect.objectContaining({
        id: imported.players[0].id,
        sources: [
          expect.objectContaining({ sourceName: 'transfermarkt' }),
          expect.objectContaining({ sourceName: 'soccerway' }),
        ],
      }),
    ]);
    expect(database.getProjectSummary(project.id)).toMatchObject({
      teamCount: 2,
      playerCount: 2,
      combinedLeagueCount: 1,
      combinedTeamCount: 1,
      combinedPlayerCount: 1,
    });
    expect(() =>
      database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds: [],
      }),
    ).toThrow('Choose between one and four source teams.');
    database.close();
  });

  test('lists canonical combined filter options and applies entity-specific filters', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Combined filters',
      referenceDate: '2026-07-01',
    });
    const importTeam = (input: {
      sourceId: string;
      name: string;
      season: string;
      countryCode3: string;
      league?: {
        sourceId: string;
        name: string;
        tier?: number;
        countryCode3: string;
      };
      player?: {
        sourceId: string;
        name: string;
        countryName: string;
        countryCode2: string;
        countryCode3: string;
        position: 'ATTACKER' | 'DEFENDER';
        positionDetail: 'ST' | 'CB';
        foot: 'RIGHT' | 'LEFT';
      };
    }) => {
      for (const sourceName of ['transfermarkt', 'soccerway'] as const) {
        const season = sourceName === 'transfermarkt' ? input.season : undefined;
        database.commitImport({
          projectId: project.id,
          sourceName,
          operation: mergeOperation(),
          ...(input.league && {
            league: {
              ...input.league,
              sourceId: `${sourceName}-${input.league.sourceId}`,
              season,
              sourceUrl: `${sourceName}-${input.league.sourceId}-url`,
            },
          }),
          teams: [
            {
              sourceId: `${sourceName}-${input.sourceId}`,
              name: input.name,
              season,
              sourceUrl: `${sourceName}-${input.sourceId}-url`,
              players: input.player
                ? [
                    {
                      ...input.player,
                      sourceId: `${sourceName}-${input.player.sourceId}`,
                    },
                  ]
                : [],
            },
          ],
        });
      }
      if (input.league) {
        const sourceLeagues = database.listEntities({
          projectId: project.id,
          entity: 'leagues',
          pageIndex: 0,
          pageSize: 25,
          search: input.league.name,
          sort: 'name',
          direction: 'asc',
        }).rows as League[];
        database.updateLeagueCountries({
          projectId: project.id,
          ids: sourceLeagues.map(({ id }) => id),
          countryCode3: input.league.countryCode3,
        });
        if (input.league.tier !== undefined) {
          database.updateLeagueTiers({
            projectId: project.id,
            ids: sourceLeagues.map(({ id }) => id),
            tier: input.league.tier,
          });
        }
      }
      const importedTeams = database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: input.name,
        sort: 'name',
        direction: 'asc',
      }).rows as Team[];
      database.updateTeamCountries({
        projectId: project.id,
        ids: importedTeams.map(({ id }) => id),
        countryCode3: input.countryCode3,
      });
      const sourceTeams = database
        .listCombineTeamCandidates({
          projectId: project.id,
          search: input.name,
        })
        .filter(({ name }) => name === input.name);
      if (sourceTeams.length !== 2) throw new Error(`Expected two source teams for ${input.name}`);
      const preview = database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds: sourceTeams.map(({ id }) => id),
      });
      return database.commitTeamCombination({
        projectId: project.id,
        sourceTeamIds: sourceTeams.map(({ id }) => id),
        league: input.league
          ? {
              kind: 'create',
              sourceLeagueIds: preview.sourceLeagues.map(({ id }) => id),
              resolutions: {},
            }
          : { kind: 'none' },
        matchGroups: preview.matchGroups,
        selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
        teamResolutions: {},
        playerResolutions: {},
      });
    };

    const english = importTeam({
      sourceId: 'alpha',
      name: 'Alpha FC',
      season: '2026',
      countryCode3: 'ENG',
      league: {
        sourceId: 'premier',
        name: 'Premier League',
        tier: 1,
        countryCode3: 'ENG',
      },
      player: {
        sourceId: 'alpha-player',
        name: 'Alpha Striker',
        countryName: 'Senegal',
        countryCode2: 'SN',
        countryCode3: 'SEN',
        position: 'ATTACKER',
        positionDetail: 'ST',
        foot: 'RIGHT',
      },
    });
    const czech = importTeam({
      sourceId: 'beta',
      name: 'Beta FC',
      season: '2025',
      countryCode3: 'CZE',
      league: {
        sourceId: 'czech-league',
        name: 'Czech First League',
        countryCode3: 'CZE',
      },
      player: {
        sourceId: 'beta-player',
        name: 'Beta Defender',
        countryName: 'Czech Republic',
        countryCode2: 'CZ',
        countryCode3: 'CZE',
        position: 'DEFENDER',
        positionDetail: 'CB',
        foot: 'LEFT',
      },
    });
    const unassigned = importTeam({
      sourceId: 'gamma',
      name: 'Gamma FC',
      season: '2024',
      countryCode3: 'DEU',
      player: {
        sourceId: 'gamma-player',
        name: 'Gamma Defender',
        countryName: 'Czech Republic',
        countryCode2: 'CZ',
        countryCode3: 'CZE',
        position: 'DEFENDER',
        positionDetail: 'CB',
        foot: 'LEFT',
      },
    });

    const leagueOptions = database.listCombinedEntityFilterOptions({
      projectId: project.id,
      entity: 'leagues',
    });
    expect(leagueOptions).toMatchObject({
      entity: 'leagues',
      tiers: [1],
      hasLeaguesWithoutTier: true,
    });
    expect(leagueOptions).not.toHaveProperty('seasons');
    if (leagueOptions.entity !== 'leagues') throw new Error('Expected league options');
    expect(leagueOptions.countries.map(({ name }) => name)).toEqual(['Czech Republic', 'England']);

    const teamOptions = database.listCombinedEntityFilterOptions({
      projectId: project.id,
      entity: 'teams',
    });
    expect(teamOptions).toMatchObject({
      entity: 'teams',
      hasTeamsWithoutLeague: true,
    });
    expect(teamOptions).not.toHaveProperty('seasons');
    if (teamOptions.entity !== 'teams') throw new Error('Expected team options');
    expect(teamOptions.leagues.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: czech.league?.id, name: 'Czech First League' },
      { id: english.league?.id, name: 'Premier League' },
    ]);

    const playerOptions = database.listCombinedEntityFilterOptions({
      projectId: project.id,
      entity: 'players',
    });
    expect(playerOptions).toMatchObject({
      entity: 'players',
      positions: ['DEFENDER', 'ATTACKER'],
      positionDetails: ['CB', 'ST'],
      feet: ['LEFT', 'RIGHT'],
    });
    if (playerOptions.entity !== 'players') throw new Error('Expected player options');
    expect(playerOptions.teams.map(({ id }) => id)).toEqual([
      english.team.id,
      czech.team.id,
      unassigned.team.id,
    ]);
    expect(playerOptions.nationalities.map(({ name }) => name)).toEqual([
      'Czech Republic',
      'Senegal',
    ]);

    const list = (
      entity: 'leagues' | 'teams' | 'players',
      filters: Partial<Parameters<SnapshotDatabase['listCombinedEntities']>[0]>,
    ) =>
      database.listCombinedEntities({
        projectId: project.id,
        entity,
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
        ...filters,
      });

    expect(
      list('leagues', {
        countries: ['Czech Republic', 'England'],
      }).total,
    ).toBe(2);
    expect(
      list('leagues', {
        tiers: [1],
        includeLeaguesWithoutTier: true,
      }).total,
    ).toBe(2);
    expect(
      list('leagues', {
        countries: ['England'],
      }).rows.map(({ name }) => name),
    ).toEqual(['Premier League']);
    expect(
      list('teams', {
        leagueIds: [english.league?.id ?? ''],
        includeTeamsWithoutLeague: true,
      }).rows.map(({ name }) => name),
    ).toEqual(['Alpha FC', 'Gamma FC']);
    expect(
      list('teams', {
        countries: ['Czech Republic', 'Germany'],
      }).rows.map(({ name }) => name),
    ).toEqual(['Beta FC', 'Gamma FC']);
    expect(
      list('players', {
        teamIds: [english.team.id, czech.team.id],
        nationalities: ['Czech Republic', 'Senegal'],
      }).total,
    ).toBe(2);
    expect(
      list('players', {
        positions: ['ATTACKER'],
        positionDetails: ['ST'],
        feet: ['RIGHT'],
      }).rows.map(({ name }) => name),
    ).toEqual(['Alpha Striker']);

    const otherProject = database.createProject({
      name: 'Other combined filters',
      referenceDate: '2026-08-01',
    });
    expect(
      database.listCombinedEntityFilterOptions({
        projectId: otherProject.id,
        entity: 'players',
      }),
    ).toEqual({
      entity: 'players',
      teams: [],
      nationalities: [],
      positions: [],
      positionDetails: [],
      feet: [],
      customBadges: [],
    });
    database.close();
  });

  test('atomically deletes selected combined players while preserving source records', () => {
    const database = createDatabase();
    const createCombinedPlayers = (
      projectName: string,
      playerNames: readonly string[],
    ): {
      projectId: string;
      combinedPlayers: CombinedPlayer[];
      sourcePlayerCount: number;
    } => {
      const project = database.createProject({
        name: projectName,
        referenceDate: '2026-07-01',
      });
      for (const sourceName of ['transfermarkt', 'soccerway'] as const) {
        database.commitImport({
          projectId: project.id,
          sourceName,
          operation: mergeOperation(),
          teams: [
            {
              sourceId: `${sourceName}-team`,
              name: `${projectName} Team`,
              sourceUrl: `${sourceName}-team-url`,
              players: playerNames.map((name, index) => ({
                sourceId: `${sourceName}-player-${index}`,
                name,
                birthdate: `199${index}-01-01`,
              })),
            },
          ],
        });
      }
      const candidates = database.listCombineTeamCandidates({
        projectId: project.id,
        search: `${projectName} Team`,
      });
      const preview = database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds: candidates.map(({ id }) => id),
      });
      const result = database.commitTeamCombination({
        projectId: project.id,
        sourceTeamIds: candidates.map(({ id }) => id),
        league: { kind: 'none' },
        matchGroups: preview.matchGroups,
        selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
        teamResolutions: {},
        playerResolutions: {},
      });
      const sourcePlayerCount = database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).total;
      return { projectId: project.id, combinedPlayers: result.players, sourcePlayerCount };
    };
    const selected = createCombinedPlayers('Combined player deletion', [
      'Ada Striker',
      'Bea Keeper',
      'Cia Midfielder',
    ]);
    const preserved = createCombinedPlayers('Preserved combined player deletion', ['Dee Defender']);

    expect(() =>
      database.deleteCombinedPlayers({
        projectId: selected.projectId,
        ids: [selected.combinedPlayers[0].id, preserved.combinedPlayers[0].id],
      }),
    ).toThrow('One or more selected combined players were not found.');
    expect(() =>
      database.deleteCombinedPlayers({ projectId: selected.projectId, ids: [] }),
    ).toThrow('Choose at least one valid combined player.');
    expect(database.getProjectSummary(selected.projectId)).toMatchObject({
      combinedPlayerCount: 3,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));
    const summary = database.deleteCombinedPlayers({
      projectId: selected.projectId,
      ids: [
        selected.combinedPlayers[0].id,
        selected.combinedPlayers[1].id,
        selected.combinedPlayers[0].id,
      ],
    });
    vi.useRealTimers();

    expect(summary).toMatchObject({
      combinedPlayerCount: 1,
      playerCount: selected.sourcePlayerCount,
      updatedAt: '2035-01-01T00:00:00.000Z',
    });
    expect(
      database.listEntities({
        projectId: selected.projectId,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).total,
    ).toBe(selected.sourcePlayerCount);
    expect(database.getProjectSummary(preserved.projectId)).toMatchObject({
      combinedPlayerCount: 1,
      playerCount: preserved.sourcePlayerCount,
    });
    database.close();
  });

  test('atomically deletes selected combined leagues and teams with detach or cascade behavior', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Combined league and team deletion',
      referenceDate: '2026-07-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved combined deletion',
      referenceDate: '2026-07-01',
    });
    const combineTeam = (
      projectId: string,
      suffix: string,
    ): { league: CombinedLeague; team: CombinedTeam; players: CombinedPlayer[] } => {
      for (const sourceName of ['transfermarkt', 'soccerway'] as const) {
        database.commitImport({
          projectId,
          sourceName,
          operation: mergeOperation(),
          league: {
            sourceId: `${sourceName}-league-${suffix}`,
            name: `League ${suffix}`,
            sourceUrl: `${sourceName}-league-${suffix}-url`,
          },
          teams: [
            {
              sourceId: `${sourceName}-team-${suffix}`,
              name: `Team ${suffix}`,
              sourceUrl: `${sourceName}-team-${suffix}-url`,
              players: [
                {
                  sourceId: `${sourceName}-player-${suffix}`,
                  name: `Player ${suffix}`,
                },
              ],
            },
          ],
        });
      }
      const candidates = database.listCombineTeamCandidates({
        projectId,
        search: `Team ${suffix}`,
      });
      const preview = database.previewTeamCombination({
        projectId,
        sourceTeamIds: candidates.map(({ id }) => id),
      });
      const result = database.commitTeamCombination({
        projectId,
        sourceTeamIds: candidates.map(({ id }) => id),
        league: {
          kind: 'create',
          sourceLeagueIds: preview.sourceLeagues.map(({ id }) => id),
          resolutions: {},
        },
        matchGroups: preview.matchGroups,
        selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
        teamResolutions: {},
        playerResolutions: {},
      });
      if (!result.league) throw new Error('Expected a combined league.');
      return { league: result.league, team: result.team, players: result.players };
    };
    const first = combineTeam(project.id, 'A');
    const second = combineTeam(project.id, 'B');
    const preserved = combineTeam(preservedProject.id, 'C');
    const combinedPlayerCount = first.players.length + second.players.length;

    expect(() =>
      database.deleteCombinedLeagues({
        projectId: project.id,
        ids: [first.league.id, preserved.league.id],
        cascade: false,
      }),
    ).toThrow('One or more selected combined leagues were not found.');
    expect(() =>
      database.deleteCombinedLeagues({ projectId: project.id, ids: [], cascade: false }),
    ).toThrow('Choose at least one valid combined league.');
    expect(() => database.deleteCombinedTeams({ projectId: project.id, ids: [] })).toThrow(
      'Choose at least one valid combined team.',
    );
    expect(database.getProjectSummary(project.id)).toMatchObject({
      combinedLeagueCount: 2,
      combinedTeamCount: 2,
      combinedPlayerCount,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-02-01T00:00:00.000Z'));
    const detachedSummary = database.deleteCombinedLeagues({
      projectId: project.id,
      ids: [first.league.id, first.league.id],
      cascade: false,
    });
    vi.useRealTimers();
    expect(detachedSummary).toMatchObject({
      combinedLeagueCount: 1,
      combinedTeamCount: 2,
      combinedPlayerCount,
      updatedAt: '2035-02-01T00:00:00.000Z',
    });
    expect(
      database.listCombinedEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: 'Team A',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ id: first.team.id, leagueId: undefined })]);

    expect(
      database.deleteCombinedLeagues({
        projectId: project.id,
        ids: [second.league.id],
        cascade: true,
      }),
    ).toMatchObject({
      combinedLeagueCount: 0,
      combinedTeamCount: 1,
      combinedPlayerCount: first.players.length,
    });
    expect(
      database.deleteCombinedTeams({
        projectId: project.id,
        ids: [first.team.id, first.team.id],
      }),
    ).toMatchObject({
      combinedLeagueCount: 0,
      combinedTeamCount: 0,
      combinedPlayerCount: 0,
      leagueCount: 4,
      teamCount: 4,
      playerCount: 4,
    });
    expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
      combinedLeagueCount: 1,
      combinedTeamCount: 1,
      combinedPlayerCount: preserved.players.length,
      leagueCount: 2,
      teamCount: 2,
      playerCount: 2,
    });
    database.close();
  });

  test('detects an unambiguous existing combined league for team previews', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Detected combined leagues',
      referenceDate: '2026-07-01',
    });
    const importLeague = (
      sourceName: SourceName,
      leagueSourceId: string,
      leagueName: string,
      teamSourceIds: string[],
    ) => {
      database.commitImport({
        projectId: project.id,
        sourceName,
        operation: mergeOperation(),
        league: {
          sourceId: leagueSourceId,
          name: leagueName,
          sourceUrl: `${leagueSourceId}-url`,
        },
        teams: teamSourceIds.map((sourceId) => ({
          sourceId,
          name: sourceId,
          sourceUrl: `${sourceId}-url`,
          players: [
            {
              sourceId: `${sourceId}-player`,
              name: `${sourceId} Player`,
            },
          ],
        })),
      });
    };
    importLeague('transfermarkt', 'tm-a', 'League A', ['tm-a-1', 'tm-a-2']);
    importLeague('soccerway', 'sw-a', 'League A', ['sw-a-1', 'sw-a-2']);
    importLeague('worldfootball', 'wf-b', 'League B', ['wf-b-1', 'wf-b-2']);
    importLeague('eurofotbal', 'ef-b', 'League B', ['ef-b-1', 'ef-b-2']);

    const teamId = (sourceName: SourceName, sourceId: string): string => {
      const team = database
        .listCombineTeamCandidates({ projectId: project.id, sourceName, search: sourceId })
        .find((candidate) => candidate.sourceId === sourceId);
      if (!team) throw new Error(`Expected source team ${sourceId}`);
      return team.id;
    };
    const createCombinedTeam = (sourceTeamIds: string[]) => {
      const preview = database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds,
      });
      return database.commitTeamCombination({
        projectId: project.id,
        sourceTeamIds,
        league: {
          kind: 'create',
          sourceLeagueIds: preview.sourceLeagues.map(({ id }) => id),
          resolutions: {},
        },
        matchGroups: preview.matchGroups,
        selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
        teamResolutions: {},
        playerResolutions: {},
      });
    };

    const leagueBTeamIds = [teamId('worldfootball', 'wf-b-2'), teamId('eurofotbal', 'ef-b-2')];
    expect(
      database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds: leagueBTeamIds,
      }).detectedCombinedLeagueId,
    ).toBeUndefined();

    const combinedA = createCombinedTeam([
      teamId('transfermarkt', 'tm-a-1'),
      teamId('soccerway', 'sw-a-1'),
    ]);
    expect(combinedA.league).toBeDefined();
    const combinedB = createCombinedTeam([
      teamId('worldfootball', 'wf-b-1'),
      teamId('eurofotbal', 'ef-b-1'),
    ]);
    expect(combinedB.league).toBeDefined();
    if (!combinedA.league || !combinedB.league) {
      throw new Error('Expected both combined leagues');
    }

    const detectedPreview = database.previewTeamCombination({
      projectId: project.id,
      sourceTeamIds: [teamId('transfermarkt', 'tm-a-2'), teamId('soccerway', 'sw-a-2')],
    });
    expect(detectedPreview.detectedCombinedLeagueId).toBe(combinedA.league.id);
    expect(detectedPreview.combinedLeagues).toContainEqual(
      expect.objectContaining({ id: combinedA.league.id }),
    );

    expect(
      database.previewTeamCombination({
        projectId: project.id,
        sourceTeamIds: [teamId('transfermarkt', 'tm-a-2'), teamId('worldfootball', 'wf-b-2')],
      }).detectedCombinedLeagueId,
    ).toBeUndefined();

    expect(
      database.previewTeamCombination({
        projectId: project.id,
        combinedTeamId: combinedA.team.id,
        sourceTeamIds: [
          teamId('transfermarkt', 'tm-a-1'),
          teamId('soccerway', 'sw-a-1'),
          teamId('worldfootball', 'wf-b-2'),
        ],
      }).detectedCombinedLeagueId,
    ).toBe(combinedA.league.id);
    database.close();
  });

  test('filters combine team candidates by their stored source league', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'League-filtered candidates',
      referenceDate: '2026-07-01',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'first-league',
        name: 'First League',
        sourceUrl: 'first-league',
      },
      teams: [
        {
          sourceId: 'first-team',
          name: 'First Team',
          sourceUrl: 'first-team',
          players: [],
        },
      ],
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'second-league',
        name: 'Second League',
        sourceUrl: 'second-league',
      },
      teams: [
        {
          sourceId: 'second-team',
          name: 'Second Team',
          sourceUrl: 'second-team',
          players: [],
        },
      ],
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'unassigned-team',
          name: 'Unassigned Team',
          sourceUrl: 'unassigned-team',
          players: [],
        },
      ],
    });

    const leagues = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
      sourceNames: ['transfermarkt'],
    }).rows as League[];
    const firstLeague = leagues.find(({ sourceId }) => sourceId === 'first-league');
    expect(firstLeague).toBeDefined();
    if (!firstLeague) throw new Error('Expected the imported first league');

    expect(
      database.listCombineTeamCandidates({
        projectId: project.id,
        sourceName: 'transfermarkt',
        search: '',
      }),
    ).toHaveLength(3);
    expect(
      database.listCombineTeamCandidates({
        projectId: project.id,
        sourceName: 'transfermarkt',
        leagueId: firstLeague.id,
        search: '',
      }),
    ).toEqual([expect.objectContaining({ sourceId: 'first-team' })]);
    database.close();
  });

  test('widens v5 source constraints without changing existing WorldFootball records', () => {
    const path = createDatabasePath();
    const v5Database = new DatabaseSync(path);
    v5Database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations VALUES
        (1, '2025-01-01T00:00:00.000Z'),
        (2, '2025-01-02T00:00:00.000Z'),
        (3, '2025-01-03T00:00:00.000Z'),
        (4, '2025-01-04T00:00:00.000Z'),
        (5, '2025-01-05T00:00:00.000Z');
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        reference_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE leagues (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball')),
        source_id TEXT NOT NULL,
        name TEXT NOT NULL,
        season TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, source_name, source_id, season)
      ) STRICT;
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        league_id TEXT REFERENCES leagues(id) ON DELETE SET NULL,
        source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball')),
        source_id TEXT NOT NULL,
        name TEXT NOT NULL,
        season TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, source_name, source_id, season)
      ) STRICT;
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball')),
        source_id TEXT NOT NULL,
        name TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        jersey_number INTEGER,
        position TEXT,
        birthdate TEXT,
        height REAL,
        weight REAL,
        foot TEXT,
        joined TEXT,
        contract_expires TEXT,
        market_value REAL,
        country_name TEXT,
        country_code2 TEXT,
        country_code3 TEXT,
        minutes_played INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        position_detail TEXT,
        UNIQUE(project_id, team_id, source_name, source_id)
      ) STRICT;
      INSERT INTO projects VALUES (
        'project-v5', 'WorldFootball v5', '2026-01-01',
        '2025-01-01T00:00:00.000Z', '2025-01-04T00:00:00.000Z'
      );
      INSERT INTO leagues VALUES (
        'league-v5', 'project-v5', 'worldfootball',
        'co7093/mexico-lp---serie-b', 'Mexico LP - Serie B', '',
        '2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z'
      );
      INSERT INTO teams VALUES (
        'team-v5', 'project-v5', 'league-v5', 'worldfootball',
        'te237557/artesanos-metepec', 'Artesanos Metepec', '',
        '2025-01-02T00:00:00.000Z', '2025-01-03T00:00:00.000Z'
      );
      INSERT INTO players(
        id, project_id, team_id, source_name, source_id, name, position,
        created_at, updated_at, position_detail
      ) VALUES (
        'player-v5', 'project-v5', 'team-v5', 'worldfootball',
        'pe599828/oscar-altamirano', 'Óscar Altamirano', 'ATTACKER',
        '2025-01-03T00:00:00.000Z', '2025-01-04T00:00:00.000Z', 'GK'
      );
    `);
    v5Database.close();

    const database = new SnapshotDatabase(path);
    expect(
      database.getEntity({ projectId: 'project-v5', entity: 'leagues', id: 'league-v5' }),
    ).toMatchObject({
      sourceName: 'worldfootball',
      sourceId: 'co7093/mexico-lp---serie-b',
      sourceUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    });
    expect(
      database.getEntity({ projectId: 'project-v5', entity: 'teams', id: 'team-v5' }),
    ).toMatchObject({ leagueId: 'league-v5', sourceName: 'worldfootball' });
    expect(
      database.listEntities({
        projectId: 'project-v5',
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({
      id: 'player-v5',
      teamId: 'team-v5',
      sourceName: 'worldfootball',
      sourceId: 'pe599828/oscar-altamirano',
      position: 'ATTACKER',
      positionDetail: 'GK',
    });
    database.close();

    const migratedDatabase = new DatabaseSync(path);
    expect(
      migratedDatabase.prepare('SELECT max(version) AS version FROM schema_migrations').get(),
    ).toMatchObject({ version: 13 });
    const leagueSchema = migratedDatabase
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leagues'")
      .get() as { sql: string };
    expect(leagueSchema.sql).toContain("'eurofotbal'");
    expect(migratedDatabase.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    migratedDatabase.close();
  });

  test('persists one global export destination across database sessions', () => {
    const path = createDatabasePath();
    let database = new SnapshotDatabase(path);

    expect(database.getExportDestination()).toBeUndefined();
    database.setExportDestination('/exports/first');
    expect(database.getExportDestination()).toBe('/exports/first');
    database.setExportDestination('/exports/latest');
    database.close();

    database = new SnapshotDatabase(path);
    expect(database.getExportDestination()).toBe('/exports/latest');
    expect(() => database.setExportDestination('   ')).toThrow(ApplicationError);
    database.close();
  });

  test('persists one global export configuration and ignores invalid stored values', () => {
    const path = createDatabasePath();
    const configuration = {
      dataset: 'combined' as const,
      format: 'csv' as const,
      columns: defaultExportColumns(),
      fieldNames: camelCaseExportFieldNames(),
    };
    let database = new SnapshotDatabase(path);

    expect(database.getExportConfiguration()).toBeUndefined();
    expect(database.updateExportConfiguration(configuration)).toEqual(configuration);
    database.close();

    database = new SnapshotDatabase(path);
    expect(database.getExportConfiguration()).toEqual(configuration);
    const invalidConfiguration = {
      ...configuration,
      columns: { ...defaultExportColumns(), leagues: [] },
    };
    expect(() => database.updateExportConfiguration(invalidConfiguration)).toThrow(
      ApplicationError,
    );
    database.close();

    const rawDatabase = new DatabaseSync(path);
    rawDatabase
      .prepare("UPDATE application_preferences SET value = 'invalid' WHERE key = $key")
      .run({ key: 'export.configuration' });
    rawDatabase.close();

    database = new SnapshotDatabase(path);
    expect(database.getExportConfiguration()).toBeUndefined();
    database.close();
  });

  test('persists visibility and field-name preset collections independently', () => {
    const path = createDatabasePath();
    let database = new SnapshotDatabase(path);

    expect(database.getExportVisibilityPresets()).toBeUndefined();
    expect(database.getExportFieldNamePresets()).toBeUndefined();
    database.updateExportVisibilityPresets([
      {
        id: 'custom-visible',
        name: 'Public fields',
        columns: defaultExportColumns(),
      },
    ]);
    expect(database.getExportFieldNamePresets()).toBeUndefined();
    database.updateExportFieldNamePresets([]);
    expect(database.getExportFieldNamePresets()).toEqual([]);
    database.close();

    database = new SnapshotDatabase(path);
    expect(database.getExportVisibilityPresets()).toEqual([
      {
        id: 'custom-visible',
        name: 'Public fields',
        columns: defaultExportColumns(),
      },
    ]);
    expect(database.getExportFieldNamePresets()).toEqual([]);
    database.updateExportFieldNamePresets([
      {
        id: 'custom-api-names',
        name: 'API names',
        fieldNames: camelCaseExportFieldNames(),
      },
    ]);
    expect(database.getExportVisibilityPresets()).toHaveLength(1);
    database.close();
  });

  test('rejects invalid presets in either SQLite preference collection', () => {
    const database = createDatabase();
    const invalidColumns = defaultExportColumns();
    invalidColumns.leagues = [];
    const invalidNames = camelCaseExportFieldNames();
    invalidNames.players[0].outputName = 'sources';

    expect(() =>
      database.updateExportVisibilityPresets([
        { id: 'custom-empty', name: 'Empty', columns: invalidColumns },
      ]),
    ).toThrow(ApplicationError);
    expect(() =>
      database.updateExportFieldNamePresets([
        { id: 'custom-reserved', name: 'Reserved', fieldNames: invalidNames },
      ]),
    ).toThrow(ApplicationError);
    expect(database.getExportVisibilityPresets()).toBeUndefined();
    expect(database.getExportFieldNamePresets()).toBeUndefined();
    database.close();
  });

  test('normalizes names, rejects case-insensitive duplicates, and sorts by reference date', () => {
    const database = createDatabase();
    const first = database.createProject({ name: ' 2026/1 ', referenceDate: '2026-01-01' });
    database.createProject({ name: '2026/2', referenceDate: '2026-07-01' });

    expect(first.name).toBe('2026/1');
    expect(first).toMatchObject({
      leagueCount: 0,
      teamCount: 0,
      playerCount: 0,
      sourceNames: [],
    });
    expect(database.listProjects().map((project) => project.name)).toEqual(['2026/2', '2026/1']);
    expect(() => database.createProject({ name: '2026/1', referenceDate: '2025-01-01' })).toThrow(
      ApplicationError,
    );
    const renamed = database.renameProject({ projectId: first.id, name: '  Winter 2026  ' });
    expect(renamed).toMatchObject({ id: first.id, name: 'Winter 2026' });
    expect(() => database.renameProject({ projectId: first.id, name: '2026/2' })).toThrow(
      ApplicationError,
    );
    database.close();
  });

  test('deletes a project with all related data and preserves unrelated projects', () => {
    const database = createDatabase();
    const deletedProject = database.createProject({
      name: 'Deleted project',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved project',
      referenceDate: '2026-07-01',
    });
    const importProject = (projectId: string, suffix: string) =>
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        league: {
          sourceId: `league-${suffix}`,
          name: `League ${suffix}`,
          sourceUrl: `https://example.test/league-${suffix}`,
        },
        teams: [
          {
            sourceId: `team-${suffix}`,
            name: `Team ${suffix}`,
            sourceUrl: `https://example.test/team-${suffix}`,
            players: [{ sourceId: `player-${suffix}`, name: `Player ${suffix}` }],
          },
        ],
      });
    importProject(deletedProject.id, 'deleted');
    importProject(preservedProject.id, 'preserved');

    expect(database.deleteProject(deletedProject.id)).toMatchObject({
      id: deletedProject.id,
      leagueCount: 1,
      teamCount: 1,
      playerCount: 1,
    });
    expect(() => database.getProjectSummary(deletedProject.id)).toThrow(ApplicationError);
    expect(() => database.deleteProject(deletedProject.id)).toThrow(ApplicationError);
    expect(database.listProjects()).toEqual([expect.objectContaining({ id: preservedProject.id })]);
    expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
      leagueCount: 1,
      teamCount: 1,
      playerCount: 1,
    });
    database.close();
  });

  test('deletes all projects and their related data in one operation', () => {
    const database = createDatabase();
    const first = database.createProject({
      name: 'First project',
      referenceDate: '2026-01-01',
    });
    const second = database.createProject({
      name: 'Second project',
      referenceDate: '2026-07-01',
    });
    const importProject = (projectId: string, suffix: string) =>
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId: `league-${suffix}`,
          name: `League ${suffix}`,
          sourceUrl: `https://example.test/league-${suffix}`,
        },
        teams: [
          {
            sourceId: `team-${suffix}`,
            name: `Team ${suffix}`,
            sourceUrl: `https://example.test/team-${suffix}`,
            players: [{ sourceId: `player-${suffix}`, name: `Player ${suffix}` }],
          },
        ],
      });
    importProject(first.id, 'first');
    importProject(second.id, 'second');

    expect(database.deleteAllProjects()).toEqual([first.id, second.id].sort());
    expect(database.listProjects()).toEqual([]);
    expect(() => database.getProjectSummary(first.id)).toThrow(ApplicationError);
    expect(() => database.getProjectSummary(second.id)).toThrow(ApplicationError);
    expect(database.deleteAllProjects()).toEqual([]);
    database.close();
  });

  test('deletes a project-scoped team with its players and refreshes the project summary', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Team deletion',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved team project',
      referenceDate: '2026-07-01',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'league-delete-team',
        name: 'League',
        sourceUrl: 'https://example.test/league',
      },
      teams: [
        {
          sourceId: 'delete-team',
          name: 'Delete Team',
          sourceUrl: 'https://example.test/delete-team',
          players: [
            { sourceId: 'delete-player-1', name: 'Delete Player 1' },
            { sourceId: 'delete-player-2', name: 'Delete Player 2' },
          ],
        },
        {
          sourceId: 'keep-team',
          name: 'Keep Team',
          sourceUrl: 'https://example.test/keep-team',
          players: [{ sourceId: 'keep-player', name: 'Keep Player' }],
        },
      ],
    });
    const deletedTeam = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: 'Delete Team',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    expect(deletedTeam).toMatchObject({ name: 'Delete Team', playerCount: 2 });
    expect(() =>
      database.deleteTeam({ projectId: preservedProject.id, id: deletedTeam.id }),
    ).toThrow(ApplicationError);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const summary = database.deleteTeam({ projectId: project.id, id: deletedTeam.id });
    vi.useRealTimers();

    expect(summary).toMatchObject({
      id: project.id,
      leagueCount: 1,
      teamCount: 1,
      playerCount: 1,
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    expect(() =>
      database.getEntity({ projectId: project.id, entity: 'teams', id: deletedTeam.id }),
    ).toThrow(ApplicationError);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ name: 'Keep Player' })]);
    expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
      teamCount: 0,
      playerCount: 0,
    });
    expect(() => database.deleteTeam({ projectId: project.id, id: deletedTeam.id })).toThrow(
      ApplicationError,
    );
    database.close();
  });

  test('atomically deletes selected project teams with their players', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Bulk team deletion',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved bulk team deletion',
      referenceDate: '2026-07-01',
    });
    const importTeams = (projectId: string, suffix: string): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId: `bulk-league-${suffix}`,
          name: `Bulk League ${suffix}`,
          sourceUrl: `https://example.test/bulk-league-${suffix}`,
        },
        teams: [
          {
            sourceId: `bulk-team-a-${suffix}`,
            name: `Bulk Team A ${suffix}`,
            sourceUrl: `https://example.test/bulk-team-a-${suffix}`,
            players: [
              { sourceId: `bulk-player-a1-${suffix}`, name: `Bulk Player A1 ${suffix}` },
              { sourceId: `bulk-player-a2-${suffix}`, name: `Bulk Player A2 ${suffix}` },
            ],
          },
          {
            sourceId: `bulk-team-b-${suffix}`,
            name: `Bulk Team B ${suffix}`,
            sourceUrl: `https://example.test/bulk-team-b-${suffix}`,
            players: [{ sourceId: `bulk-player-b-${suffix}`, name: `Bulk Player B ${suffix}` }],
          },
        ],
      });
    };
    importTeams(project.id, 'selected');
    importTeams(preservedProject.id, 'preserved');
    const selectedTeams = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const preservedTeam = database.listEntities({
      projectId: preservedProject.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];

    expect(() =>
      database.deleteTeams({
        projectId: project.id,
        ids: [selectedTeams[0].id, preservedTeam.id],
      }),
    ).toThrow('One or more selected teams were not found.');
    expect(database.getProjectSummary(project.id)).toMatchObject({ teamCount: 2, playerCount: 3 });
    expect(() => database.deleteTeams({ projectId: project.id, ids: [] })).toThrow(
      'Choose at least one valid team.',
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2033-01-01T00:00:00.000Z'));
    const summary = database.deleteTeams({
      projectId: project.id,
      ids: [...selectedTeams.map(({ id }) => id), selectedTeams[0].id],
    });
    vi.useRealTimers();

    expect(summary).toMatchObject({
      leagueCount: 1,
      teamCount: 0,
      playerCount: 0,
      updatedAt: '2033-01-01T00:00:00.000Z',
    });
    expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
      leagueCount: 1,
      teamCount: 2,
      playerCount: 3,
    });
    database.close();
  });

  test('deletes single and selected players within the requested project', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Player deletion',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved player deletion',
      referenceDate: '2026-07-01',
    });
    const importPlayers = (projectId: string, suffix: string): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        teams: [
          {
            sourceId: `player-team-${suffix}`,
            name: `Player Team ${suffix}`,
            sourceUrl: `https://example.test/player-team-${suffix}`,
            players: [
              { sourceId: `player-a-${suffix}`, name: `Player A ${suffix}` },
              { sourceId: `player-b-${suffix}`, name: `Player B ${suffix}` },
              { sourceId: `player-c-${suffix}`, name: `Player C ${suffix}` },
            ],
          },
        ],
      });
    };
    importPlayers(project.id, 'selected');
    importPlayers(preservedProject.id, 'preserved');
    const players = database.listEntities({
      projectId: project.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const preservedPlayer = database.listEntities({
      projectId: preservedProject.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];

    expect(() =>
      database.deletePlayers({
        projectId: project.id,
        ids: [players[0].id, preservedPlayer.id],
      }),
    ).toThrow('One or more selected players were not found.');
    expect(() => database.deletePlayers({ projectId: project.id, ids: [] })).toThrow(
      'Choose at least one valid player.',
    );

    database.deletePlayer({ projectId: project.id, id: players[0].id });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2034-01-01T00:00:00.000Z'));
    const summary = database.deletePlayers({
      projectId: project.id,
      ids: [players[1].id, players[2].id, players[1].id],
    });
    vi.useRealTimers();

    expect(summary).toMatchObject({
      leagueCount: 0,
      teamCount: 1,
      playerCount: 0,
      updatedAt: '2034-01-01T00:00:00.000Z',
    });
    expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
      teamCount: 1,
      playerCount: 3,
    });
    database.close();
  });

  test('atomically applies and clears a canonical country for selected teams', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Bulk team countries',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved bulk team countries',
      referenceDate: '2026-07-01',
    });
    const importTeam = (projectId: string, suffix: string): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        teams: [
          {
            sourceId: `country-team-${suffix}`,
            name: `Country Team ${suffix}`,
            sourceUrl: `https://example.test/country-team-${suffix}`,
            players: [],
          },
        ],
      });
    };
    importTeam(project.id, 'a');
    importTeam(project.id, 'b');
    importTeam(preservedProject.id, 'preserved');
    const teams = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const preservedTeam = database.listEntities({
      projectId: preservedProject.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];

    expect(() =>
      database.updateTeamCountries({
        projectId: project.id,
        ids: [teams[0].id, preservedTeam.id],
        countryCode3: 'CZE',
      }),
    ).toThrow('One or more selected teams were not found.');
    expect(() =>
      database.updateTeamCountries({
        projectId: project.id,
        ids: teams.map(({ id }) => id),
        countryCode3: 'invalid',
      }),
    ).toThrow('Choose a valid country or leave it empty.');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2034-01-01T00:00:00.000Z'));
    const summary = database.updateTeamCountries({
      projectId: project.id,
      ids: [...teams.map(({ id }) => id), teams[0].id],
      countryCode3: 'CZE',
    });
    vi.useRealTimers();

    expect(summary.updatedAt).toBe('2034-01-01T00:00:00.000Z');
    for (const team of teams) {
      expect(
        database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
      ).toMatchObject({
        countryName: 'Czech Republic',
        countryCode2: 'CZ',
        countryCode3: 'CZE',
        updatedAt: '2034-01-01T00:00:00.000Z',
      });
    }

    database.updateTeamCountries({
      projectId: project.id,
      ids: teams.map(({ id }) => id),
    });
    for (const team of teams) {
      expect(
        database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
      ).toMatchObject({
        countryName: undefined,
        countryCode2: undefined,
        countryCode3: undefined,
      });
    }
    expect(
      database.getEntity({
        projectId: preservedProject.id,
        entity: 'teams',
        id: preservedTeam.id,
      }),
    ).toMatchObject({ countryName: undefined });
    database.close();
  });

  test.each(['league-only', 'league-and-teams'] as const)(
    'deletes a project-scoped league using the %s mode',
    (mode) => {
      const database = createDatabase();
      const project = database.createProject({
        name: `League deletion ${mode}`,
        referenceDate: '2026-01-01',
      });
      const preservedProject = database.createProject({
        name: `Preserved league project ${mode}`,
        referenceDate: '2026-07-01',
      });
      database.commitImport({
        projectId: project.id,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId: 'league-delete',
          name: 'Delete League',
          sourceUrl: 'https://example.test/delete-league',
        },
        teams: [
          {
            sourceId: 'delete-team-one',
            name: 'Delete Team One',
            sourceUrl: 'https://example.test/delete-team-one',
            players: [
              { sourceId: 'delete-player-one', name: 'Delete Player One' },
              { sourceId: 'delete-player-two', name: 'Delete Player Two' },
            ],
          },
          {
            sourceId: 'delete-team-two',
            name: 'Delete Team Two',
            sourceUrl: 'https://example.test/delete-team-two',
            players: [{ sourceId: 'delete-player-three', name: 'Delete Player Three' }],
          },
        ],
      });
      database.commitImport({
        projectId: project.id,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId: 'league-keep',
          name: 'Keep League',
          sourceUrl: 'https://example.test/keep-league',
        },
        teams: [
          {
            sourceId: 'keep-team',
            name: 'Keep Team',
            sourceUrl: 'https://example.test/keep-team',
            players: [{ sourceId: 'keep-player', name: 'Keep Player' }],
          },
        ],
      });
      const deletedLeague = database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: 'Delete League',
        sort: 'name',
        direction: 'asc',
      }).rows[0];
      expect(deletedLeague).toMatchObject({
        name: 'Delete League',
        teamCount: 2,
        playerCount: 3,
      });
      expect(
        database.getEntity({
          projectId: project.id,
          entity: 'leagues',
          id: deletedLeague.id,
        }),
      ).toMatchObject({ teamCount: 2, playerCount: 3 });
      expect(() =>
        database.deleteLeague({
          projectId: preservedProject.id,
          id: deletedLeague.id,
          mode,
        }),
      ).toThrow(ApplicationError);
      expect(() =>
        database.deleteLeague({
          projectId: project.id,
          id: deletedLeague.id,
          mode: 'invalid' as never,
        }),
      ).toThrow('Choose a valid league deletion option.');

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const summary = database.deleteLeague({
        projectId: project.id,
        id: deletedLeague.id,
        mode,
      });
      vi.useRealTimers();

      expect(summary).toMatchObject({
        id: project.id,
        leagueCount: 1,
        teamCount: mode === 'league-only' ? 3 : 1,
        playerCount: mode === 'league-only' ? 4 : 1,
        updatedAt: '2030-01-01T00:00:00.000Z',
      });
      const teams = database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows;
      expect(teams.map((team) => team.name)).toEqual(
        mode === 'league-only'
          ? ['Delete Team One', 'Delete Team Two', 'Keep Team']
          : ['Keep Team'],
      );
      if (mode === 'league-only') {
        expect(teams.filter((team) => team.name.startsWith('Delete'))).toEqual([
          expect.objectContaining({ leagueId: undefined, playerCount: 2 }),
          expect.objectContaining({ leagueId: undefined, playerCount: 1 }),
        ]);
      }
      expect(
        database
          .listEntities({
            projectId: project.id,
            entity: 'players',
            pageIndex: 0,
            pageSize: 25,
            search: '',
            sort: 'name',
            direction: 'asc',
          })
          .rows.map((player) => player.name),
      ).toEqual(
        mode === 'league-only'
          ? ['Delete Player One', 'Delete Player Three', 'Delete Player Two', 'Keep Player']
          : ['Keep Player'],
      );
      expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
        leagueCount: 0,
        teamCount: 0,
        playerCount: 0,
      });
      expect(() =>
        database.deleteLeague({ projectId: project.id, id: deletedLeague.id, mode }),
      ).toThrow(ApplicationError);
      database.close();
    },
  );

  test.each(['league-only', 'league-and-teams'] as const)(
    'atomically deletes selected leagues using the %s mode',
    (mode) => {
      const database = createDatabase();
      const project = database.createProject({
        name: `Bulk league deletion ${mode}`,
        referenceDate: '2026-01-01',
      });
      const preservedProject = database.createProject({
        name: `Preserved bulk deletion ${mode}`,
        referenceDate: '2026-07-01',
      });
      const importLeague = (projectId: string, suffix: string, name: string): void => {
        database.commitImport({
          projectId,
          sourceName: 'transfermarkt',
          operation: mergeOperation(),
          league: {
            sourceId: `league-${suffix}`,
            name,
            sourceUrl: `https://example.test/league-${suffix}`,
          },
          teams: [
            {
              sourceId: `team-${suffix}`,
              name: `Team ${suffix}`,
              sourceUrl: `https://example.test/team-${suffix}`,
              players: [{ sourceId: `player-${suffix}`, name: `Player ${suffix}` }],
            },
          ],
        });
      };
      importLeague(project.id, 'a', 'Delete League A');
      importLeague(project.id, 'b', 'Delete League B');
      importLeague(project.id, 'keep', 'Keep League');
      importLeague(preservedProject.id, 'other', 'Other Project League');
      const selectedLeagues = database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: 'Delete League',
        sort: 'name',
        direction: 'asc',
      }).rows;
      const preservedLeague = database.listEntities({
        projectId: preservedProject.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0];

      expect(() =>
        database.deleteLeagues({
          projectId: project.id,
          ids: [selectedLeagues[0].id, preservedLeague.id],
          mode,
        }),
      ).toThrow('One or more selected leagues were not found.');
      expect(database.getProjectSummary(project.id).leagueCount).toBe(3);
      expect(() => database.deleteLeagues({ projectId: project.id, ids: [], mode })).toThrow(
        'Choose at least one valid league.',
      );

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2031-01-01T00:00:00.000Z'));
      const summary = database.deleteLeagues({
        projectId: project.id,
        ids: [...selectedLeagues.map(({ id }) => id), selectedLeagues[0].id],
        mode,
      });
      vi.useRealTimers();

      expect(summary).toMatchObject({
        leagueCount: 1,
        teamCount: mode === 'league-only' ? 3 : 1,
        playerCount: mode === 'league-only' ? 3 : 1,
        updatedAt: '2031-01-01T00:00:00.000Z',
      });
      expect(
        database
          .listEntities({
            projectId: project.id,
            entity: 'leagues',
            pageIndex: 0,
            pageSize: 25,
            search: '',
            sort: 'name',
            direction: 'asc',
          })
          .rows.map(({ name }) => name),
      ).toEqual(['Keep League']);
      const teams = database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows;
      expect(teams.map(({ name }) => name)).toEqual(
        mode === 'league-only' ? ['Team a', 'Team b', 'Team keep'] : ['Team keep'],
      );
      if (mode === 'league-only') {
        expect(teams.filter(({ name }) => name !== 'Team keep')).toEqual([
          expect.objectContaining({ leagueId: undefined }),
          expect.objectContaining({ leagueId: undefined }),
        ]);
      }
      expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
        leagueCount: 1,
        teamCount: 1,
        playerCount: 1,
      });
      database.close();
    },
  );

  test('atomically applies and clears a canonical country for selected leagues', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Bulk league countries',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved bulk countries',
      referenceDate: '2026-07-01',
    });
    const importLeague = (projectId: string, suffix: string): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId: `country-${suffix}`,
          name: `Country League ${suffix}`,
          sourceUrl: `https://example.test/country-${suffix}`,
        },
        teams: [
          {
            sourceId: `country-team-${suffix}`,
            name: `Country Team ${suffix}`,
            sourceUrl: `https://example.test/country-team-${suffix}`,
            players: [],
          },
        ],
      });
    };
    importLeague(project.id, 'a');
    importLeague(project.id, 'b');
    importLeague(preservedProject.id, 'other');
    const leagues = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const preservedLeague = database.listEntities({
      projectId: preservedProject.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];

    expect(() =>
      database.updateLeagueCountries({
        projectId: project.id,
        ids: [leagues[0].id, preservedLeague.id],
        countryCode3: 'CZE',
      }),
    ).toThrow('One or more selected leagues were not found.');
    expect(() =>
      database.updateLeagueCountries({
        projectId: project.id,
        ids: leagues.map(({ id }) => id),
        countryCode3: 'invalid',
      }),
    ).toThrow('Choose a valid country or leave it empty.');
    expect(
      database.getEntity({ projectId: project.id, entity: 'leagues', id: leagues[0].id }),
    ).toMatchObject({ countryName: undefined });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2032-01-01T00:00:00.000Z'));
    const summary = database.updateLeagueCountries({
      projectId: project.id,
      ids: leagues.map(({ id }) => id),
      countryCode3: 'CZE',
    });
    vi.useRealTimers();

    expect(summary.updatedAt).toBe('2032-01-01T00:00:00.000Z');
    for (const league of leagues) {
      expect(
        database.getEntity({ projectId: project.id, entity: 'leagues', id: league.id }),
      ).toMatchObject({
        countryName: 'Czech Republic',
        countryCode2: 'CZ',
        countryCode3: 'CZE',
        updatedAt: '2032-01-01T00:00:00.000Z',
      });
    }

    database.updateLeagueCountries({
      projectId: project.id,
      ids: leagues.map(({ id }) => id),
    });
    for (const league of leagues) {
      expect(
        database.getEntity({ projectId: project.id, entity: 'leagues', id: league.id }),
      ).toMatchObject({
        countryName: undefined,
        countryCode2: undefined,
        countryCode3: undefined,
      });
    }
    expect(
      database.getEntity({
        projectId: preservedProject.id,
        entity: 'leagues',
        id: preservedLeague.id,
      }),
    ).toMatchObject({ countryName: undefined });
    database.close();
  });

  test('validates, preserves, sorts, and filters optional league tiers', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'League tiers',
      referenceDate: '2026-01-01',
    });
    const otherProject = database.createProject({
      name: 'Other league tiers',
      referenceDate: '2026-07-01',
    });
    const importLeague = (projectId: string, suffix: string): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId: `tier-${suffix}`,
          name: `Tier League ${suffix}`,
          sourceUrl: `https://example.test/tier-${suffix}`,
        },
        teams: [
          {
            sourceId: `tier-team-${suffix}`,
            name: `Tier Team ${suffix}`,
            sourceUrl: `https://example.test/tier-team-${suffix}`,
            players: [],
          },
        ],
      });
    };
    importLeague(project.id, 'a');
    importLeague(project.id, 'b');
    importLeague(project.id, 'unset');
    importLeague(otherProject.id, 'other');
    const leagues = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const otherLeague = database.listEntities({
      projectId: otherProject.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];

    for (const tier of [0, 1.5, 11]) {
      expect(() =>
        database.updateLeagueTiers({
          projectId: project.id,
          ids: [leagues[0].id],
          tier,
        }),
      ).toThrow('Choose a tier from 1 to 10 or leave it empty.');
    }
    expect(() =>
      database.updateLeagueTiers({
        projectId: project.id,
        ids: [leagues[0].id, otherLeague.id],
        tier: 2,
      }),
    ).toThrow('One or more selected leagues were not found.');

    const first = leagues[0];
    expect(
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'leagues',
        id: first.id,
        name: first.name,
        sourceId: first.sourceId,
        tier: 3,
      }),
    ).toMatchObject({ tier: 3 });
    database.updateLeagueTiers({
      projectId: project.id,
      ids: [leagues[1].id],
      tier: 7,
    });

    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'tier',
        direction: 'asc',
      }).rows as League[],
    ).toEqual([
      expect.objectContaining({ tier: undefined }),
      expect.objectContaining({ tier: 3 }),
      expect.objectContaining({ tier: 7 }),
    ]);
    expect(
      database.listEntityFilterOptions({ projectId: project.id, entity: 'leagues' }),
    ).toMatchObject({
      tiers: [3, 7],
      hasLeaguesWithoutTier: true,
    });
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'leagues',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          tiers: [3],
          includeLeaguesWithoutTier: true,
        })
        .rows.map(({ name }) => name),
    ).toEqual(['Tier League a', 'Tier League unset']);

    importLeague(project.id, 'a');
    expect(
      database.getEntity({ projectId: project.id, entity: 'leagues', id: first.id }),
    ).toMatchObject({ tier: 3 });

    database.updateLeagueTiers({ projectId: project.id, ids: [first.id] });
    expect(
      database.getEntity({ projectId: project.id, entity: 'leagues', id: first.id }),
    ).toMatchObject({ tier: undefined });
    expect(
      database.getEntity({
        projectId: otherProject.id,
        entity: 'leagues',
        id: otherLeague.id,
      }),
    ).toMatchObject({ tier: undefined });
    database.close();
  });

  test('deletes selected source data with mixed-source descendants and preserves other projects', () => {
    const path = createDatabasePath();
    let database = new SnapshotDatabase(path);
    const project = database.createProject({
      name: 'Source deletion',
      referenceDate: '2026-01-01',
    });
    const preservedProject = database.createProject({
      name: 'Preserved project',
      referenceDate: '2026-07-01',
    });
    const importSource = (
      projectId: string,
      sourceName: 'transfermarkt' | 'soccerway',
      suffix: string,
    ) =>
      database.commitImport({
        projectId,
        sourceName,
        operation: mergeOperation(),
        league: {
          sourceId: `league-${suffix}`,
          name: `League ${suffix}`,
          sourceUrl: `https://example.test/league-${suffix}`,
        },
        teams: [
          {
            sourceId: `team-${suffix}`,
            name: `Team ${suffix}`,
            sourceUrl: `https://example.test/team-${suffix}`,
            players: [{ sourceId: `player-${suffix}`, name: `Player ${suffix}` }],
          },
        ],
      });
    importSource(project.id, 'transfermarkt', 'transfer');
    importSource(project.id, 'soccerway', 'soccer');
    importSource(preservedProject.id, 'transfermarkt', 'preserved');
    const transferLeague = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: 'League transfer',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    const soccerTeam = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: 'Team soccer',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    expect(transferLeague.id).toBeTruthy();
    expect(soccerTeam.id).toBeTruthy();
    database.close();

    const rawDatabase = new DatabaseSync(path);
    rawDatabase
      .prepare('UPDATE teams SET league_id = $leagueId WHERE id = $teamId')
      .run({ leagueId: transferLeague.id, teamId: soccerTeam.id });
    rawDatabase
      .prepare(
        `UPDATE players SET source_name = 'worldfootball'
         WHERE project_id = $projectId AND source_id = 'player-transfer'`,
      )
      .run({ projectId: project.id });
    rawDatabase
      .prepare(
        `UPDATE players SET source_name = 'transfermarkt'
         WHERE project_id = $projectId AND source_id = 'player-soccer'`,
      )
      .run({ projectId: project.id });
    rawDatabase.close();
    database = new SnapshotDatabase(path);

    const preview = database.previewSourceDataDeletion({
      projectId: project.id,
      sourceNames: ['transfermarkt', 'eurofotbal', 'transfermarkt'],
    });

    expect(preview).toEqual({ leagues: 1, teams: 1, players: 2 });
    expect(database.getProjectSummary(project.id)).toMatchObject({
      leagueCount: 2,
      teamCount: 2,
      playerCount: 2,
      sourceNames: ['transfermarkt', 'soccerway', 'worldfootball'],
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const result = database.deleteSourceData({
      projectId: project.id,
      sourceNames: ['transfermarkt', 'eurofotbal', 'transfermarkt'],
    });
    vi.useRealTimers();

    expect(result.deleted).toEqual(preview);
    expect(result.project).toMatchObject({
      id: project.id,
      leagueCount: 1,
      teamCount: 1,
      playerCount: 0,
      sourceNames: ['soccerway'],
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([
      expect.objectContaining({
        id: soccerTeam.id,
        sourceName: 'soccerway',
        leagueId: undefined,
      }),
    ]);
    expect(database.getProjectSummary(preservedProject.id)).toMatchObject({
      leagueCount: 1,
      teamCount: 1,
      playerCount: 1,
      sourceNames: ['transfermarkt'],
    });
    database.close();
  });

  test('rejects empty or unsupported source deletion requests', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Invalid source deletion',
      referenceDate: '2026-01-01',
    });

    expect(() => database.deleteSourceData({ projectId: project.id, sourceNames: [] })).toThrow(
      ApplicationError,
    );
    expect(() =>
      database.previewSourceDataDeletion({ projectId: project.id, sourceNames: [] }),
    ).toThrow(ApplicationError);
    expect(() =>
      database.deleteSourceData({
        projectId: project.id,
        sourceNames: ['unsupported' as never],
      }),
    ).toThrow(ApplicationError);
    expect(() =>
      database.previewSourceDataDeletion({
        projectId: project.id,
        sourceNames: ['unsupported' as never],
      }),
    ).toThrow(ApplicationError);
    expect(database.getProjectSummary(project.id)).toMatchObject({
      leagueCount: 0,
      teamCount: 0,
      playerCount: 0,
    });
    database.close();
  });

  test('isolates projects, pages data, and deduplicates imports without a season', () => {
    const database = createDatabase();
    const first = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    const second = database.createProject({ name: '2026/2', referenceDate: '2026-07-01' });
    const request = {
      projectId: first.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: {
        sourceId: 'GB1',
        name: 'Premier League',
        sourceUrl: 'https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1',
      },
      teams: [
        {
          sourceId: '281',
          name: 'Manchester City',
          sourceUrl: 'https://www.transfermarkt.com/manchester-city/startseite/verein/281',
          players: [{ sourceId: '1', name: 'One, Player' }],
        },
      ],
    };

    database.commitImport(request);
    database.commitImport(request);
    expect(database.getProjectSummary(first.id)).toMatchObject({
      leagueCount: 1,
      teamCount: 1,
      playerCount: 1,
      sourceNames: ['transfermarkt'],
    });
    expect(database.getProjectSummary(second.id)).toMatchObject({
      leagueCount: 0,
      teamCount: 0,
      playerCount: 0,
      sourceNames: [],
    });
    expect(database.listProjects()).toEqual([
      expect.objectContaining({
        id: second.id,
        leagueCount: 0,
        teamCount: 0,
        playerCount: 0,
        sourceNames: [],
      }),
      expect.objectContaining({
        id: first.id,
        leagueCount: 1,
        teamCount: 1,
        playerCount: 1,
        sourceNames: ['transfermarkt'],
      }),
    ]);
    const page = database.listEntities({
      projectId: first.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 1,
      search: 'One',
      sort: 'name',
      direction: 'asc',
    });
    expect(page.total).toBe(1);
    expect(page.rows[0]?.name).toBe('One, Player');
    const leagues = database.listEntities({
      projectId: first.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'teamCount',
      direction: 'desc',
    });
    const teams = database.listEntities({
      projectId: first.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'playerCount',
      direction: 'desc',
    });
    expect(leagues.rows[0]).toMatchObject({ name: 'Premier League', teamCount: 1 });
    expect(teams.rows[0]).toMatchObject({ name: 'Manchester City', playerCount: 1 });
    database.close();
  });

  test('keeps provider identities independent, derives URLs, and filters every entity by source', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Provider identities',
      referenceDate: '2026-01-01',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'CZ1',
        name: 'Czech First League',
        season: '2026',
        sourceUrl: 'https://ignored.test/transfermarkt-league',
      },
      teams: [
        {
          sourceId: '281',
          name: 'Transfermarkt Team',
          season: '2026',
          sourceUrl: 'https://ignored.test/transfermarkt-team',
          players: [{ sourceId: 'shared-player', name: 'Transfermarkt Player' }],
        },
      ],
    });
    const soccerwayRequest: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'soccerway',
      operation: mergeOperation(),
      league: {
        sourceId: 'czech-republic/chance-liga/standings/bNFMkskm',
        name: 'Chance Liga',
        sourceUrl: 'https://ignored.test/soccerway-league',
      },
      teams: [
        {
          sourceId: 'slavia-prague/viXGgnyB',
          name: 'Soccerway Team',
          sourceUrl: 'https://ignored.test/soccerway-team',
          players: [{ sourceId: 'shared-player', name: 'Soccerway Player' }],
        },
      ],
    };
    database.commitImport(soccerwayRequest);
    database.commitImport(soccerwayRequest);
    const worldFootballRequest: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'worldfootball',
      operation: mergeOperation(),
      league: {
        sourceId: 'co7093/mexico-lp---serie-b',
        name: 'Mexico LP - Serie B',
        sourceUrl: 'https://ignored.test/worldfootball-league',
      },
      teams: [
        {
          sourceId: 'te237557/artesanos-metepec',
          name: 'WorldFootball Team',
          sourceUrl: 'https://ignored.test/worldfootball-team',
          players: [{ sourceId: 'pe599828/oscar-altamirano', name: 'WorldFootball Player' }],
        },
      ],
    };
    database.commitImport(worldFootballRequest);
    database.commitImport(worldFootballRequest);
    const eurofotbalRequest: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'eurofotbal',
      operation: mergeOperation(),
      league: {
        sourceId: 'chance-liga/2026-2027',
        name: 'Chance Liga',
        sourceUrl: 'https://ignored.test/eurofotbal-league',
      },
      teams: [
        {
          sourceId: 'cesko/sparta-praha',
          name: 'Eurofotbal Team',
          sourceUrl: 'https://ignored.test/eurofotbal-team',
          players: [{ sourceId: 'cesko/example-player', name: 'Eurofotbal Player' }],
        },
      ],
    };
    database.commitImport(eurofotbalRequest);
    database.commitImport(eurofotbalRequest);

    expect(database.getProjectSummary(project.id)).toMatchObject({
      leagueCount: 4,
      teamCount: 4,
      playerCount: 4,
    });
    const listBySource = (
      entity: 'leagues' | 'teams' | 'players',
      sourceName: 'soccerway' | 'worldfootball' | 'eurofotbal',
    ) =>
      database.listEntities({
        projectId: project.id,
        entity,
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
        sourceNames: [sourceName, 'invalid' as never],
      });
    const soccerwayLeague = listBySource('leagues', 'soccerway').rows[0];
    const soccerwayTeam = listBySource('teams', 'soccerway').rows[0];
    const soccerwayPlayer = listBySource('players', 'soccerway').rows[0];
    expect(soccerwayLeague).toMatchObject({
      sourceName: 'soccerway',
      sourceId: 'czech-republic/chance-liga/standings/bNFMkskm',
      season: undefined,
      sourceUrl:
        'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
    });
    expect(soccerwayTeam).toMatchObject({
      sourceName: 'soccerway',
      sourceId: 'slavia-prague/viXGgnyB',
      season: undefined,
      sourceUrl: 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
    });
    expect(
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: soccerwayTeam.id,
        name: 'Soccerway Team',
        sourceId: 'sparta-prague/hM8p0S1x',
        season: '2027',
      }),
    ).toMatchObject({
      sourceName: 'soccerway',
      sourceId: 'sparta-prague/hM8p0S1x',
      season: undefined,
      sourceUrl: 'https://www.soccerway.com/team/sparta-prague/hM8p0S1x/squad/',
    });
    expect(soccerwayPlayer).toMatchObject({
      sourceName: 'soccerway',
      sourceId: 'shared-player',
      sourceUrl: 'https://www.soccerway.com/player/shared-player/',
    });
    const worldFootballLeague = listBySource('leagues', 'worldfootball').rows[0];
    const worldFootballTeam = listBySource('teams', 'worldfootball').rows[0];
    const worldFootballPlayer = listBySource('players', 'worldfootball').rows[0];
    expect(worldFootballLeague).toMatchObject({
      sourceName: 'worldfootball',
      sourceId: 'co7093/mexico-lp---serie-b',
      season: undefined,
      sourceUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
    });
    expect(worldFootballTeam).toMatchObject({
      sourceName: 'worldfootball',
      sourceId: 'te237557/artesanos-metepec',
      season: undefined,
      sourceUrl: 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
    });
    expect(worldFootballPlayer).toMatchObject({
      sourceName: 'worldfootball',
      sourceId: 'pe599828/oscar-altamirano',
      sourceUrl: 'https://www.worldfootball.net/person/pe599828/oscar-altamirano/',
    });
    expect(
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: worldFootballTeam.id,
        name: 'WorldFootball Team',
        sourceId: 'te162876/sporting-caneramy',
        season: '2027',
      }),
    ).toMatchObject({
      sourceId: 'te162876/sporting-caneramy',
      season: undefined,
      sourceUrl: 'https://www.worldfootball.net/teams/te162876/sporting-caneramy/squad/',
    });
    const eurofotbalLeague = listBySource('leagues', 'eurofotbal').rows[0];
    const eurofotbalTeam = listBySource('teams', 'eurofotbal').rows[0];
    const eurofotbalPlayer = listBySource('players', 'eurofotbal').rows[0];
    expect(eurofotbalLeague).toMatchObject({
      sourceName: 'eurofotbal',
      sourceId: 'chance-liga/2026-2027',
      season: undefined,
      sourceUrl: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
    });
    expect(eurofotbalTeam).toMatchObject({
      sourceName: 'eurofotbal',
      sourceId: 'cesko/sparta-praha',
      season: undefined,
      sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
    });
    expect(eurofotbalPlayer).toMatchObject({
      sourceName: 'eurofotbal',
      sourceId: 'cesko/example-player',
    });
    expect(eurofotbalPlayer).not.toHaveProperty('sourceUrl');
    expect(
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: eurofotbalTeam.id,
        name: 'Eurofotbal Team',
        sourceId: 'cesko/slavia-praha',
        season: '2027',
      }),
    ).toMatchObject({
      sourceId: 'cesko/slavia-praha',
      season: undefined,
      sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/slavia-praha/soupiska',
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
        sourceNames: ['transfermarkt'],
      }).rows[0],
    ).toMatchObject({
      sourceName: 'transfermarkt',
      sourceId: 'shared-player',
    });
    for (const entity of ['leagues', 'teams', 'players'] as const) {
      expect(
        database.listEntityFilterOptions({ projectId: project.id, entity }).sourceNames,
      ).toEqual(['eurofotbal', 'soccerway', 'transfermarkt', 'worldfootball']);
    }
    if (!soccerwayRequest.league) throw new Error('Expected a Soccerway league fixture.');
    const soccerwayImportLeague = soccerwayRequest.league;
    expect(() =>
      database.commitImport({
        ...soccerwayRequest,
        league: { ...soccerwayImportLeague, season: '2026' },
      }),
    ).toThrow('Soccerway imports do not support seasons.');
    if (!worldFootballRequest.league) throw new Error('Expected a WorldFootball league fixture.');
    const worldFootballImportLeague = worldFootballRequest.league;
    expect(() =>
      database.commitImport({
        ...worldFootballRequest,
        league: { ...worldFootballImportLeague, season: '2026' },
      }),
    ).toThrow('WorldFootball imports do not support seasons.');
    if (!eurofotbalRequest.league) throw new Error('Expected a Eurofotbal league fixture.');
    const eurofotbalImportLeague = eurofotbalRequest.league;
    expect(() =>
      database.commitImport({
        ...eurofotbalRequest,
        league: { ...eurofotbalImportLeague, season: '2026' },
      }),
    ).toThrow('Eurofotbal imports do not support seasons.');
    database.close();
  });

  test('filters league, team, and player pages by badge status before counting and pagination', () => {
    vi.useFakeTimers();
    const database = createDatabase();
    try {
      vi.setSystemTime(new Date('2026-01-24T12:00:00.000Z'));
      const project = database.createProject({
        name: 'Badge filters',
        referenceDate: '2026-07-24',
      });
      const importSnapshot = (suffix: string, label: string): void => {
        database.commitImport({
          projectId: project.id,
          sourceName: 'transfermarkt',
          operation: mergeOperation(),
          league: {
            sourceId: `league-${suffix}`,
            name: `${label} League`,
            sourceUrl: `https://example.test/league-${suffix}`,
          },
          teams: [
            {
              sourceId: `team-${suffix}`,
              name: `${label} Team`,
              sourceUrl: `https://example.test/team-${suffix}`,
              players: [{ sourceId: `player-${suffix}`, name: `${label} Player` }],
            },
          ],
        });
      };
      importSnapshot('old', 'Old');

      const statusAsOf = '2026-07-24T12:00:00.000Z';
      vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'));
      importSnapshot('recent', 'Recent');
      vi.setSystemTime(new Date(statusAsOf));
      importSnapshot('new', 'New');
      const customBadge = database.createCustomBadge({
        name: 'Review status',
        description: 'Included through the custom badge filter',
        color: 'blue',
      });

      for (const entity of ['leagues', 'teams', 'players'] as const) {
        const entityLabel = { leagues: 'League', teams: 'Team', players: 'Player' }[entity];
        const list = (
          statuses: ('new' | 'old')[],
          pageIndex = 0,
          pageSize = 25,
          statusSettings = { newDays: 3, oldMonths: 6 },
        ) =>
          database.listEntities({
            projectId: project.id,
            entity,
            pageIndex,
            pageSize,
            search: '',
            sort: 'name',
            direction: 'asc',
            statuses,
            statusAsOf,
            statusSettings,
          });

        expect(list(['new'])).toMatchObject({
          total: 1,
          rows: [expect.objectContaining({ name: `New ${entityLabel}` })],
        });
        expect(list(['old'])).toMatchObject({
          total: 1,
          rows: [expect.objectContaining({ name: `Old ${entityLabel}` })],
        });
        const oldRow = list([]).rows.find(({ name }) => name === `Old ${entityLabel}`);
        if (!oldRow) throw new Error('Old badge fixture is missing.');
        database.updateEntityCustomBadges({
          projectId: project.id,
          entity,
          ids: [oldRow.id],
          addBadgeIds: [customBadge.id],
          removeBadgeIds: [],
        });
        expect(
          database
            .listEntities({
              projectId: project.id,
              entity,
              pageIndex: 0,
              pageSize: 25,
              search: '',
              sort: 'name',
              direction: 'asc',
              statuses: ['new'],
              customBadgeIds: [customBadge.id],
              statusAsOf,
            })
            .rows.map(({ name }) => name),
        ).toEqual([`New ${entityLabel}`, `Old ${entityLabel}`]);

        const firstPage = list(['new', 'old'], 0, 1);
        const secondPage = list(['new', 'old'], 1, 1);
        expect(firstPage.total).toBe(2);
        expect(firstPage.rows).toHaveLength(1);
        expect(secondPage.total).toBe(2);
        expect(secondPage.rows).toHaveLength(1);

        expect(list(['new'], 0, 25, { newDays: 30, oldMonths: 6 }).total).toBe(2);
        expect(list(['old'], 0, 25, { newDays: 3, oldMonths: 1 }).total).toBe(1);
        expect(new Set([...firstPage.rows, ...secondPage.rows].map(({ name }) => name))).toEqual(
          new Set([`New ${entityLabel}`, `Old ${entityLabel}`]),
        );
      }

      const invalidRequest = {
        projectId: project.id,
        entity: 'leagues' as const,
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc' as const,
      };
      expect(
        database.listEntities({
          ...invalidRequest,
          statuses: ['new'],
          statusAsOf: 'not-a-timestamp',
        }).total,
      ).toBe(1);
      expect(
        database.listEntities({
          ...invalidRequest,
          statuses: ['not-a-status' as never],
          statusAsOf,
        }).total,
      ).toBe(3);
    } finally {
      database.close();
      vi.useRealTimers();
    }
  });

  test('creates global custom badges and assigns, filters, and deletes them across entity tables', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Custom badges',
      referenceDate: '2026-07-24',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      league: {
        sourceId: 'badge-league',
        name: 'Badge League',
        sourceUrl: 'https://example.test/badge-league',
      },
      teams: [
        {
          sourceId: 'badge-team',
          name: 'Badge Team',
          sourceUrl: 'https://example.test/badge-team',
          players: [{ sourceId: 'badge-player', name: 'Badge Player' }],
        },
      ],
    });
    const badge = database.createCustomBadge({
      name: 'Review',
      description: 'Needs manual review',
      color: 'purple',
    });
    expect(badge).toMatchObject({ assignmentCount: 0, name: 'Review', color: 'purple' });
    expect(() =>
      database.createCustomBadge({
        name: ' review ',
        description: 'Duplicate',
        color: 'red',
      }),
    ).toThrow('already exists');

    for (const entity of ['leagues', 'teams', 'players'] as const) {
      const row = database.listEntities({
        projectId: project.id,
        entity,
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0];
      database.updateEntityCustomBadges({
        projectId: project.id,
        entity,
        ids: [row.id],
        addBadgeIds: [badge.id],
        removeBadgeIds: [],
      });
      expect(
        database.listEntities({
          projectId: project.id,
          entity,
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          customBadgeIds: [badge.id],
        }),
      ).toMatchObject({
        total: 1,
        rows: [
          expect.objectContaining({
            customBadges: [
              expect.objectContaining({
                id: badge.id,
                name: 'Review',
                description: 'Needs manual review',
                color: 'purple',
              }),
            ],
          }),
        ],
      });
      expect(
        database.listEntityFilterOptions({ projectId: project.id, entity }).customBadges,
      ).toEqual([expect.objectContaining({ id: badge.id, name: 'Review' })]);
    }

    expect(database.listCustomBadges()).toEqual([
      expect.objectContaining({ id: badge.id, assignmentCount: 3 }),
    ]);
    expect(database.deleteCustomBadge(badge.id)).toEqual({
      id: badge.id,
      deletedAssignmentCount: 3,
    });
    expect(database.listCustomBadges()).toEqual([]);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0]?.customBadges,
    ).toEqual([]);
    database.close();
  });

  test('keeps combined custom badges separate and assigns, filters, and deletes them', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Combined custom badges',
      referenceDate: '2026-07-24',
    });
    for (const sourceName of ['transfermarkt', 'soccerway'] as const) {
      database.commitImport({
        projectId: project.id,
        sourceName,
        operation: mergeOperation(),
        league: {
          sourceId: `${sourceName}-badge-league`,
          name: 'Badge League',
          sourceUrl: `${sourceName}-badge-league-url`,
        },
        teams: [
          {
            sourceId: `${sourceName}-badge-team`,
            name: 'Badge Team',
            sourceUrl: `${sourceName}-badge-team-url`,
            players: [
              {
                sourceId: `${sourceName}-badge-player`,
                name: 'Badge Player',
                birthdate: '2000-01-01',
              },
            ],
          },
        ],
      });
    }
    const candidates = database.listCombineTeamCandidates({
      projectId: project.id,
      search: 'Badge Team',
    });
    const preview = database.previewTeamCombination({
      projectId: project.id,
      sourceTeamIds: candidates.map(({ id }) => id),
    });
    const combined = database.commitTeamCombination({
      projectId: project.id,
      sourceTeamIds: candidates.map(({ id }) => id),
      league: {
        kind: 'create',
        sourceLeagueIds: preview.sourceLeagues.map(({ id }) => id),
        resolutions: {},
      },
      matchGroups: preview.matchGroups,
      selectedPlayerGroupIds: preview.matchGroups.map(({ id }) => id),
      teamResolutions: {},
      playerResolutions: {},
    });
    if (!combined.league || !combined.players[0]) {
      throw new Error('Expected combined badge fixtures.');
    }

    const sourceBadge = database.createCustomBadge({
      name: 'Review',
      description: 'Source review',
      color: 'red',
    });
    const badge = database.createCombinedCustomBadge({
      name: 'Review',
      description: 'Combined review',
      color: 'purple',
    });
    expect(sourceBadge.name).toBe(badge.name);
    expect(database.listCustomBadges()).toHaveLength(1);
    expect(database.listCombinedCustomBadges()).toEqual([
      expect.objectContaining({ id: badge.id, assignmentCount: 0 }),
    ]);
    expect(() =>
      database.createCombinedCustomBadge({
        name: ' review ',
        description: 'Duplicate combined badge',
        color: 'green',
      }),
    ).toThrow('already exists');

    const combinedEntities = {
      leagues: combined.league,
      teams: combined.team,
      players: combined.players[0],
    } as const;
    for (const entity of ['leagues', 'teams', 'players'] as const) {
      database.updateCombinedEntityCustomBadges({
        projectId: project.id,
        entity,
        ids: [combinedEntities[entity].id],
        addBadgeIds: [badge.id],
        removeBadgeIds: [],
      });
      expect(
        database.listCombinedEntities({
          projectId: project.id,
          entity,
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          customBadgeIds: [badge.id],
        }),
      ).toMatchObject({
        total: 1,
        rows: [
          expect.objectContaining({
            customBadges: [
              expect.objectContaining({
                id: badge.id,
                name: 'Review',
                description: 'Combined review',
                color: 'purple',
              }),
            ],
          }),
        ],
      });
      expect(
        database.listCombinedEntityFilterOptions({ projectId: project.id, entity }).customBadges,
      ).toEqual([expect.objectContaining({ id: badge.id, name: 'Review' })]);
    }

    expect(
      database.listCombinedEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
        needsReview: true,
        customBadgeIds: [badge.id],
      }).total,
    ).toBe(1);
    expect(database.listCombinedCustomBadges()).toEqual([
      expect.objectContaining({ id: badge.id, assignmentCount: 3 }),
    ]);

    database.deleteSourceData({
      projectId: project.id,
      sourceNames: ['transfermarkt'],
    });
    expect(
      database.listCombinedEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({
      needsReview: true,
      customBadges: [expect.objectContaining({ id: badge.id })],
    });

    expect(database.deleteCombinedCustomBadge(badge.id)).toEqual({
      id: badge.id,
      deletedAssignmentCount: 3,
    });
    expect(database.listCombinedCustomBadges()).toEqual([]);
    expect(database.listCustomBadges()).toEqual([
      expect.objectContaining({ id: sourceBadge.id, assignmentCount: 0 }),
    ]);
    database.close();
  });

  test('sorts players by creation timestamp', () => {
    vi.useFakeTimers();
    try {
      const database = createDatabase();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const project = database.createProject({
        name: 'Timestamp sort',
        referenceDate: '2026-01-01',
      });
      const request = {
        projectId: project.id,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        teams: [
          {
            sourceId: 'team',
            name: 'Team',
            sourceUrl: 'https://example.test/team',
            players: [{ sourceId: 'older', name: 'Older Player' }],
          },
        ],
      };
      database.commitImport(request);

      vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
      database.commitImport({
        ...request,
        teams: [
          {
            ...request.teams[0],
            players: [...request.teams[0].players, { sourceId: 'newer', name: 'Newer Player' }],
          },
        ],
      });

      const list = (direction: 'asc' | 'desc') =>
        database
          .listEntities({
            projectId: project.id,
            entity: 'players',
            pageIndex: 0,
            pageSize: 25,
            search: '',
            sort: 'createdAt',
            direction,
          })
          .rows.map((player) => player.name);
      expect(list('asc')).toEqual(['Older Player', 'Newer Player']);
      expect(list('desc')).toEqual(['Newer Player', 'Older Player']);
      expect(
        database
          .listEntities({
            projectId: project.id,
            entity: 'players',
            pageIndex: 0,
            pageSize: 25,
            search: '',
            sort: 'sourceId',
            direction: 'asc',
          })
          .rows.map((player) => player.name),
      ).toEqual(['Newer Player', 'Older Player']);
      database.close();
    } finally {
      vi.useRealTimers();
    }
  });

  test('sorts players numerically by weight', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Weight sort',
      referenceDate: '2026-01-01',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'team',
          name: 'Team',
          sourceUrl: 'https://example.test/team',
          players: [
            { sourceId: 'heavier', name: 'Heavier Player', weight: 82 },
            { sourceId: 'lighter', name: 'Lighter Player', weight: 75 },
          ],
        },
      ],
    });

    const list = (direction: 'asc' | 'desc') =>
      database
        .listEntities({
          projectId: project.id,
          entity: 'players',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'weight',
          direction,
        })
        .rows.map((player) => player.name);

    expect(list('asc')).toEqual(['Lighter Player', 'Heavier Player']);
    expect(list('desc')).toEqual(['Heavier Player', 'Lighter Player']);
    database.close();
  });

  test('filters teams and players by multiple parents, including teams without a league', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Filtered', referenceDate: '2026-01-01' });
    const otherProject = database.createProject({ name: 'Other', referenceDate: '2026-07-01' });
    const importLeague = (
      projectId: string,
      leagueId: string,
      leagueName: string,
      teamId: string,
      teamName: string,
      playerName: string,
    ) =>
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        league: {
          sourceId: leagueId,
          name: leagueName,
          sourceUrl: `https://example.test/${leagueId}`,
        },
        teams: [
          {
            sourceId: teamId,
            name: teamName,
            sourceUrl: `https://example.test/${teamId}`,
            players: [{ sourceId: `player-${teamId}`, name: playerName }],
          },
        ],
      });
    importLeague(project.id, 'league-a', 'alpha League', 'team-a', 'Alpha United', 'Selected One');
    importLeague(project.id, 'league-b', 'Beta League', 'team-b', 'Beta City', 'Selected Two');
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'team-independent',
          name: 'Independent Alpha',
          sourceUrl: 'https://example.test/team-independent',
          players: [{ sourceId: 'player-independent', name: 'Independent Player' }],
        },
      ],
    });
    importLeague(
      otherProject.id,
      'league-other',
      'Other League',
      'team-other',
      'Other Team',
      'Other Player',
    );
    const list = (projectId: string, entity: 'leagues' | 'teams') =>
      database.listEntities({
        projectId,
        entity,
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows;
    const leagues = list(project.id, 'leagues');
    const teams = list(project.id, 'teams');
    const leagueA = leagues.find((league) => league.name === 'alpha League');
    const leagueB = leagues.find((league) => league.name === 'Beta League');
    const teamA = teams.find((team) => team.name === 'Alpha United');
    const teamB = teams.find((team) => team.name === 'Beta City');
    const otherTeam = list(otherProject.id, 'teams')[0];
    if (!leagueA || !leagueB || !teamA || !teamB) {
      throw new Error('Filter fixture missing.');
    }
    expect((teams as Team[]).map((team) => team.leagueName)).toEqual([
      'alpha League',
      'Beta League',
      undefined,
    ]);

    const teamsByLeague = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'leagueName',
      direction: 'desc',
    });
    expect(teamsByLeague.rows.map((team) => team.name)).toEqual([
      'Beta City',
      'Alpha United',
      'Independent Alpha',
    ]);

    const leaguePage = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 1,
      search: '',
      sort: 'name',
      direction: 'asc',
      leagueIds: [leagueA.id, leagueB.id, leagueA.id],
    });
    expect(leaguePage.total).toBe(2);
    expect(leaguePage.rows).toHaveLength(1);

    const legacyLeaguePage = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
      leagueId: leagueA.id,
    });
    expect(legacyLeaguePage.rows.map((team) => team.name)).toEqual(['Alpha United']);

    const mixedPage = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: 'Alpha',
      sort: 'name',
      direction: 'asc',
      leagueIds: [leagueA.id],
      includeTeamsWithoutLeague: true,
    });
    expect(mixedPage.rows.map((team) => team.name)).toEqual(['Alpha United', 'Independent Alpha']);

    const detachedPage = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
      leagueIds: [],
      includeTeamsWithoutLeague: true,
    });
    expect(detachedPage.rows.map((team) => team.name)).toEqual(['Independent Alpha']);

    const playerPage = database.listEntities({
      projectId: project.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: 'Selected',
      sort: 'name',
      direction: 'asc',
      teamIds: [teamA.id, teamB.id, otherTeam.id, teamA.id],
    });
    expect(playerPage.rows.map((player) => player.name)).toEqual(['Selected One', 'Selected Two']);
    expect((playerPage.rows as Player[]).map((player) => player.teamName)).toEqual([
      'Alpha United',
      'Beta City',
    ]);
    expect((playerPage.rows as Player[]).map((player) => player.leagueName)).toEqual([
      'alpha League',
      'Beta League',
    ]);

    const playersByTeam = database.listEntities({
      projectId: project.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'teamName',
      direction: 'desc',
    });
    expect((playersByTeam.rows as Player[]).map((player) => player.teamName)).toEqual([
      'Independent Alpha',
      'Beta City',
      'Alpha United',
    ]);

    const playersByLeague = database.listEntities({
      projectId: project.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'leagueName',
      direction: 'desc',
    });
    expect(playersByLeague.rows.map((player) => player.name)).toEqual([
      'Selected Two',
      'Selected One',
      'Independent Player',
    ]);
    expect((playersByLeague.rows as Player[]).map((player) => player.leagueName)).toEqual([
      'Beta League',
      'alpha League',
      undefined,
    ]);

    const legacyPlayerPage = database.listEntities({
      projectId: project.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
      teamId: teamB.id,
    });
    expect(legacyPlayerPage.rows.map((player) => player.name)).toEqual(['Selected Two']);

    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
        leagueIds: [],
      }).total,
    ).toBe(3);
    database.close();
  });

  test('lists project-scoped filter options and combines categorical entity filters', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Facets', referenceDate: '2026-01-01' });
    const otherProject = database.createProject({
      name: 'Other facets',
      referenceDate: '2026-07-01',
    });
    const importLeague = (
      projectId: string,
      leagueId: string,
      leagueName: string,
      season: string,
      teamId: string,
      teamName: string,
      players: CommitImportRequest['teams'][number]['players'],
    ) =>
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        league: {
          sourceId: leagueId,
          name: leagueName,
          season,
          sourceUrl: `https://example.test/${leagueId}`,
        },
        teams: [
          {
            sourceId: teamId,
            name: teamName,
            season,
            sourceUrl: `https://example.test/${teamId}`,
            players,
          },
        ],
      });
    importLeague(project.id, 'league-z', 'Zulu League', '2025', 'team-b', 'Beta FC', [
      {
        sourceId: 'player-a',
        name: 'Attacker One',
        countryName: 'Senegal',
        countryCode2: 'SN',
        position: 'ATTACKER',
        positionDetail: 'ST',
        foot: 'RIGHT',
      },
      {
        sourceId: 'player-b',
        name: 'Defender One',
        countryName: 'Guinea',
        countryCode2: 'GN',
        position: 'DEFENDER',
        positionDetail: 'CB',
        foot: 'LEFT',
      },
    ]);
    importLeague(project.id, 'league-a', 'alpha League', '2026', 'team-a', 'Alpha FC', [
      {
        sourceId: 'player-c',
        name: 'Midfielder One',
        countryName: 'Senegal',
        countryCode2: 'SN',
        position: 'MIDFIELDER',
        positionDetail: 'CAM',
        foot: 'LEFT',
      },
    ]);
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'independent',
          name: 'Independent',
          season: '2024',
          sourceUrl: 'https://example.test/independent',
          players: [],
        },
      ],
    });
    importLeague(otherProject.id, 'other', 'Other League', '2030', 'other-team', 'Other FC', [
      {
        sourceId: 'other-player',
        name: 'Other Player',
        countryName: 'Portugal',
        countryCode2: 'PT',
        position: 'GOALKEEPER',
        positionDetail: 'GK',
        foot: 'RIGHT',
      },
    ]);

    expect(database.listEntityFilterOptions({ projectId: project.id, entity: 'leagues' })).toEqual({
      entity: 'leagues',
      sourceNames: ['transfermarkt'],
      countries: [],
      seasons: ['2025', '2026'],
      tiers: [],
      hasLeaguesWithoutTier: true,
      customBadges: [],
    });
    const teamOptions = database.listEntityFilterOptions({
      projectId: project.id,
      entity: 'teams',
    });
    expect(teamOptions).toMatchObject({
      entity: 'teams',
      hasTeamsWithoutLeague: true,
      seasons: ['2024', '2025', '2026'],
      leagues: [
        { sourceId: 'league-a', name: 'alpha League' },
        { sourceId: 'league-z', name: 'Zulu League' },
      ],
    });
    const playerOptions = database.listEntityFilterOptions({
      projectId: project.id,
      entity: 'players',
    });
    expect(playerOptions).toMatchObject({
      entity: 'players',
      teams: [{ name: 'Alpha FC' }, { name: 'Beta FC' }, { name: 'Independent' }],
      nationalities: [
        { name: 'Guinea', code: 'GN' },
        { name: 'Senegal', code: 'SN' },
      ],
      positions: ['DEFENDER', 'MIDFIELDER', 'ATTACKER'],
      positionDetails: ['CB', 'CAM', 'ST'],
      feet: ['LEFT', 'RIGHT'],
    });

    const leagueRows = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
      seasons: ['2026', '2026', ''],
    }).rows;
    expect(leagueRows.map((row) => row.name)).toEqual(['alpha League']);
    const betaTeam =
      playerOptions.entity === 'players'
        ? playerOptions.teams.find((team) => team.name === 'Beta FC')
        : undefined;
    const zuluLeague =
      teamOptions.entity === 'teams'
        ? teamOptions.leagues.find((league) => league.name === 'Zulu League')
        : undefined;
    if (!betaTeam || !zuluLeague) throw new Error('Filter option fixture missing.');
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'teams',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          leagueIds: [zuluLeague.id],
          seasons: ['2025'],
        })
        .rows.map((row) => row.name),
    ).toEqual(['Beta FC']);
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'players',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          teamIds: [betaTeam.id],
          nationalities: ['senegal', 'Guinea'],
          positions: ['ATTACKER'],
          positionDetails: ['ST'],
          feet: ['RIGHT'],
        })
        .rows.map((row) => row.name),
    ).toEqual(['Attacker One']);
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'players',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          positions: ['DEFENDER', 'ATTACKER'],
          positionDetails: ['CB', 'ST'],
        })
        .rows.map((row) => row.name),
    ).toEqual(['Attacker One', 'Defender One']);
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'players',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'positionDetail',
          direction: 'asc',
        })
        .rows.map((row) => row.name),
    ).toEqual(['Midfielder One', 'Defender One', 'Attacker One']);
    expect(
      database.listEntityFilterOptions({ projectId: otherProject.id, entity: 'players' }),
    ).toMatchObject({
      nationalities: [{ name: 'Portugal', code: 'PT' }],
      positions: ['GOALKEEPER'],
      positionDetails: ['GK'],
    });
    database.close();
  });

  test('lists and combines project-scoped league country filters', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Countries', referenceDate: '2026-01-01' });
    const otherProject = database.createProject({
      name: 'Other countries',
      referenceDate: '2026-07-01',
    });
    const importLeague = (
      projectId: string,
      sourceId: string,
      name: string,
      season: string,
    ): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId,
          name,
          season,
          sourceUrl: `https://example.test/${sourceId}`,
        },
        teams: [
          {
            sourceId: `${sourceId}-team`,
            name: `${name} Team`,
            season,
            sourceUrl: `https://example.test/${sourceId}-team`,
            players: [],
          },
        ],
      });
    };
    importLeague(project.id, 'league-a', 'Alpha League', '2026');
    importLeague(project.id, 'league-b', 'Championship', '2025');
    importLeague(project.id, 'league-c', 'Scottish League', '2026');
    importLeague(project.id, 'league-d', 'Unassigned League', '2026');
    importLeague(otherProject.id, 'league-e', 'Other League', '2026');

    const updateCountry = (projectId: string, sourceId: string, countryCode3: string): void => {
      const league = database
        .listEntities({
          projectId,
          entity: 'leagues',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
        })
        .rows.find((row) => row.sourceId === sourceId);
      if (!league || !('season' in league)) throw new Error(`League ${sourceId} is missing.`);
      database.updateEntityMetadata({
        projectId,
        entity: 'leagues',
        id: league.id,
        name: league.name,
        sourceId: league.sourceId,
        countryCode3,
        season: league.season,
      });
    };
    updateCountry(project.id, 'league-a', 'ENG');
    updateCountry(project.id, 'league-b', 'ENG');
    updateCountry(project.id, 'league-c', 'SCO');
    updateCountry(otherProject.id, 'league-e', 'PRT');
    const alphaLeague = database
      .listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      })
      .rows.find(({ sourceId }) => sourceId === 'league-a');
    if (!alphaLeague) throw new Error('Alpha League is missing.');
    database.updateLeagueTiers({
      projectId: project.id,
      ids: [alphaLeague.id],
      tier: 2,
    });

    expect(database.listEntityFilterOptions({ projectId: project.id, entity: 'leagues' })).toEqual({
      entity: 'leagues',
      sourceNames: ['transfermarkt'],
      countries: [
        { name: 'England', code: 'GB-ENG' },
        { name: 'Scotland', code: 'GB-SCT' },
      ],
      seasons: ['2025', '2026'],
      tiers: [2],
      hasLeaguesWithoutTier: true,
      customBadges: [],
    });
    const teamFilterOptions = database.listEntityFilterOptions({
      projectId: project.id,
      entity: 'teams',
    });
    if (teamFilterOptions.entity !== 'teams') throw new Error('Team filter options are missing.');
    expect(
      teamFilterOptions.leagues.map(({ name, countryName, countryCode, tier }) => ({
        name,
        countryName,
        countryCode,
        tier,
      })),
    ).toEqual([
      { name: 'Alpha League', countryName: 'England', countryCode: 'GB-ENG', tier: 2 },
      {
        name: 'Championship',
        countryName: 'England',
        countryCode: 'GB-ENG',
        tier: undefined,
      },
      {
        name: 'Scottish League',
        countryName: 'Scotland',
        countryCode: 'GB-SCT',
        tier: undefined,
      },
      {
        name: 'Unassigned League',
        countryName: undefined,
        countryCode: undefined,
        tier: undefined,
      },
    ]);
    expect(
      database.listEntityFilterOptions({ projectId: otherProject.id, entity: 'leagues' }),
    ).toMatchObject({
      countries: [{ name: 'Portugal', code: 'PT' }],
    });
    const otherTeamFilterOptions = database.listEntityFilterOptions({
      projectId: otherProject.id,
      entity: 'teams',
    });
    if (otherTeamFilterOptions.entity !== 'teams') {
      throw new Error('Other team filter options are missing.');
    }
    expect(otherTeamFilterOptions.leagues).toHaveLength(1);
    expect(otherTeamFilterOptions.leagues[0]).toMatchObject({
      name: 'Other League',
      countryName: 'Portugal',
      countryCode: 'PT',
    });
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'leagues',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          sourceNames: ['transfermarkt'],
          seasons: ['2026'],
          countries: ['england', 'SCOTLAND'],
        })
        .rows.map((row) => row.name),
    ).toEqual(['Alpha League', 'Scottish League']);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).total,
    ).toBe(4);
    database.close();
  });

  test('lists and combines project-scoped team country filters', () => {
    const database = createDatabase();
    const project = database.createProject({
      name: 'Team countries',
      referenceDate: '2026-01-01',
    });
    const otherProject = database.createProject({
      name: 'Other team countries',
      referenceDate: '2026-07-01',
    });
    const importLeague = (
      projectId: string,
      sourceId: string,
      leagueName: string,
      season: string,
      teamName: string,
    ): void => {
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt',
        operation: mergeOperation(),
        league: {
          sourceId,
          name: leagueName,
          season,
          sourceUrl: `https://example.test/${sourceId}`,
        },
        teams: [
          {
            sourceId: `${sourceId}-team`,
            name: teamName,
            season,
            sourceUrl: `https://example.test/${sourceId}-team`,
            players: [],
          },
        ],
      });
    };
    importLeague(project.id, 'league-a', 'Alpha League', '2026', 'Alpha FC');
    importLeague(project.id, 'league-b', 'Beta League', '2025', 'Beta FC');
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'independent',
          name: 'Independent FC',
          season: '2026',
          sourceUrl: 'https://example.test/independent',
          players: [],
        },
      ],
    });
    database.commitImport({
      projectId: otherProject.id,
      sourceName: 'transfermarkt',
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'other-team',
          name: 'Other FC',
          season: '2026',
          sourceUrl: 'https://example.test/other-team',
          players: [],
        },
      ],
    });

    const listTeams = (projectId: string) =>
      database.listEntities({
        projectId,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows;
    const updateCountry = (projectId: string, sourceId: string, countryCode3: string): void => {
      const team = listTeams(projectId).find((row) => row.sourceId === sourceId);
      if (!team) throw new Error(`Team ${sourceId} is missing.`);
      database.updateEntityMetadata({
        projectId,
        entity: 'teams',
        id: team.id,
        name: team.name,
        sourceId: team.sourceId,
        countryCode3,
        season: 'season' in team ? team.season : undefined,
        leagueId: 'leagueId' in team ? team.leagueId : undefined,
      });
    };
    updateCountry(project.id, 'league-a-team', 'ENG');
    updateCountry(project.id, 'league-b-team', 'SCO');
    updateCountry(project.id, 'independent', 'ENG');
    updateCountry(otherProject.id, 'other-team', 'PRT');

    expect(
      database.listEntityFilterOptions({ projectId: project.id, entity: 'teams' }),
    ).toMatchObject({
      countries: [
        { name: 'England', code: 'GB-ENG' },
        { name: 'Scotland', code: 'GB-SCT' },
      ],
    });
    expect(
      database.listEntityFilterOptions({ projectId: otherProject.id, entity: 'teams' }),
    ).toMatchObject({
      countries: [{ name: 'Portugal', code: 'PT' }],
    });
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'teams',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          countries: ['england', 'SCOTLAND'],
        })
        .rows.map((row) => row.name),
    ).toEqual(['Alpha FC', 'Beta FC', 'Independent FC']);

    const teamOptions = database.listEntityFilterOptions({
      projectId: project.id,
      entity: 'teams',
    });
    if (teamOptions.entity !== 'teams') throw new Error('Team options are missing.');
    const leagueA = teamOptions.leagues.find(({ sourceId }) => sourceId === 'league-a');
    if (!leagueA) throw new Error('League A is missing.');
    expect(
      database
        .listEntities({
          projectId: project.id,
          entity: 'teams',
          pageIndex: 0,
          pageSize: 25,
          search: '',
          sort: 'name',
          direction: 'asc',
          sourceNames: ['transfermarkt'],
          leagueIds: [leagueA.id],
          includeTeamsWithoutLeague: true,
          seasons: ['2026'],
          countries: ['England'],
        })
        .rows.map((row) => row.name),
    ).toEqual(['Alpha FC', 'Independent FC']);
    database.close();
  });

  test('rolls back every row when an import fails', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });

    expect(() =>
      database.commitImport({
        projectId: project.id,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        teams: [
          {
            sourceId: 'valid',
            name: 'Valid team',
            sourceUrl: 'https://example.test/valid',
            players: [{ name: 'Valid player' }],
          },
          {
            sourceId: 'invalid',
            name: '',
            sourceUrl: 'https://example.test/invalid',
            players: [{ name: 'Never committed' }],
          },
        ],
      }),
    ).toThrow();
    expect(database.getProjectSummary(project.id)).toMatchObject({ teamCount: 0, playerCount: 0 });
    database.close();
  });

  test('previews and commits an authoritative league synchronization', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    const leagueUrl = 'https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1';
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: { sourceId: 'GB1', name: 'Premier League', sourceUrl: leagueUrl },
      teams: [
        {
          sourceId: '281',
          name: 'Manchester City',
          sourceUrl: 'https://example.test/281',
          players: [
            { sourceId: '1', name: 'Existing player' },
            { sourceId: '2', name: 'Removed player' },
          ],
        },
        {
          sourceId: '985',
          name: 'Removed team',
          sourceUrl: 'https://example.test/985',
          players: [{ sourceId: '3', name: 'Removed with team' }],
        },
      ],
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: {
        sourceId: 'ES1',
        name: 'Unrelated league',
        sourceUrl: 'https://example.test/ES1',
      },
      teams: [
        {
          sourceId: '999',
          name: 'Unrelated team',
          sourceUrl: 'https://example.test/999',
          players: [{ sourceId: '9', name: 'Unrelated player' }],
        },
      ],
    });
    const leagues = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: 'Premier',
      sort: 'name',
      direction: 'asc',
    });
    const target = leagues.rows[0];
    const request = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize' as const,
        target: { entity: 'leagues' as const, id: target.id },
        options: {
          absentTeams: 'delete' as const,
          absentPlayers: 'delete' as const,
          overrideTeamNames: true,
          overridePlayerNames: true,
          teamLeagueConflicts: 'move' as const,
          playerTeamConflicts: 'move' as const,
        },
      },
      league: { sourceId: 'GB1', name: 'Premier League', sourceUrl: leagueUrl },
      teams: [
        {
          sourceId: '281',
          name: 'Manchester City updated',
          sourceUrl: 'https://example.test/281',
          players: [
            { sourceId: '1', name: 'Existing player updated' },
            { sourceId: '4', name: 'New player' },
          ],
        },
        {
          sourceId: '777',
          name: 'New team',
          sourceUrl: 'https://example.test/777',
          players: [{ sourceId: '7', name: 'New team player' }],
        },
      ],
    };

    const expectedChanges = {
      leagues: { added: 0, updated: 1, preserved: 0, deleted: 0 },
      teams: { added: 1, updated: 1, preserved: 0, moved: 0, detached: 0, deleted: 1 },
      players: {
        added: 2,
        updated: 1,
        preserved: 0,
        moved: 0,
        deduplicated: 0,
        deleted: 2,
      },
    };
    expect(database.previewImportChanges(request).changes).toEqual(expectedChanges);
    expect(database.commitImport(request).changes).toEqual(expectedChanges);
    expect(database.getProjectSummary(project.id)).toMatchObject({
      leagueCount: 2,
      teamCount: 3,
      playerCount: 4,
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Manchester City updated' }),
        expect.objectContaining({ name: 'New team' }),
        expect.objectContaining({ name: 'Unrelated team' }),
      ]),
    );
    database.close();
  });

  test('synchronizes a team to an empty squad without deleting the team', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: '281',
          name: 'Manchester City',
          sourceUrl: 'https://example.test/281',
          players: [{ sourceId: '1', name: 'Removed player' }],
        },
      ],
    });
    const team = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    const request = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize' as const,
        target: { entity: 'teams' as const, id: team.id },
        options: {
          absentPlayers: 'delete' as const,
          overridePlayerNames: true,
          playerTeamConflicts: 'move' as const,
        },
      },
      teams: [
        {
          sourceId: '281',
          name: 'Manchester City refreshed',
          sourceUrl: 'https://example.test/281',
          players: [],
        },
      ],
    };

    expect(database.commitImport(request).changes.players.deleted).toBe(1);
    expect(database.getProjectSummary(project.id)).toMatchObject({ teamCount: 1, playerCount: 0 });
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
    ).toMatchObject({ name: 'Manchester City', playerCount: 0 });
    database.close();
  });

  test('keeps absent records and preserves existing names while refreshing other metadata', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: {
        sourceId: 'GB1',
        name: 'Stored league',
        sourceUrl: 'https://example.test/GB1',
      },
      teams: [
        {
          sourceId: '281',
          name: 'Stored team',
          sourceUrl: 'https://example.test/281',
          players: [
            {
              sourceId: '1',
              name: 'Stored Player',
              firstName: 'Stored',
              lastName: 'Player',
              jerseyNumber: 7,
            },
            { sourceId: '2', name: 'Absent Player' },
          ],
        },
        {
          sourceId: '985',
          name: 'Absent team',
          sourceUrl: 'https://example.test/985',
          players: [{ sourceId: '3', name: 'Absent team player' }],
        },
      ],
    });
    const league = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    const teamsBefore = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const storedTeam = teamsBefore.find((team) => team.sourceId === '281');
    if (!storedTeam) throw new Error('Stored team fixture missing.');
    const playersBefore = database.listEntities({
      projectId: project.id,
      entity: 'players',
      teamIds: [storedTeam.id],
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const storedPlayer = playersBefore.find((player) => player.sourceId === '1');
    if (!storedPlayer) throw new Error('Stored player fixture missing.');
    const request = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize' as const,
        target: { entity: 'leagues' as const, id: league.id },
        options: {
          absentTeams: 'keep' as const,
          absentPlayers: 'keep' as const,
          overrideTeamNames: false,
          overridePlayerNames: false,
          teamLeagueConflicts: 'move' as const,
          playerTeamConflicts: 'move' as const,
        },
      },
      league: {
        sourceId: 'GB1',
        name: 'Scraped league',
        sourceUrl: 'https://example.test/GB1-refreshed',
      },
      teams: [
        {
          sourceId: '281',
          name: 'Scraped team',
          sourceUrl: 'https://example.test/281-refreshed',
          players: [
            {
              sourceId: '1',
              name: 'Scraped Name',
              firstName: 'Scraped',
              lastName: 'Name',
              jerseyNumber: 10,
              position: 'ATTACKER' as const,
            },
          ],
        },
      ],
    };

    const expectedChanges = {
      leagues: { added: 0, updated: 1, preserved: 0, deleted: 0 },
      teams: { added: 0, updated: 1, preserved: 0, moved: 0, detached: 0, deleted: 0 },
      players: {
        added: 0,
        updated: 1,
        preserved: 0,
        moved: 0,
        deduplicated: 0,
        deleted: 0,
      },
    };
    expect(database.previewImportChanges(request).changes).toEqual(expectedChanges);
    expect(database.commitImport(request).changes).toEqual(expectedChanges);
    expect(
      database.getEntity({ projectId: project.id, entity: 'leagues', id: league.id }),
    ).toMatchObject({ name: 'Stored league', teamCount: 2 });
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: storedTeam.id }),
    ).toMatchObject({
      id: storedTeam.id,
      name: 'Stored team',
      leagueId: league.id,
      playerCount: 2,
    });
    const playersAfter = database.listEntities({
      projectId: project.id,
      entity: 'players',
      teamIds: [storedTeam.id],
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    expect(playersAfter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: storedPlayer.id,
          name: 'Stored Player',
          firstName: 'Stored',
          lastName: 'Player',
          jerseyNumber: 10,
          position: 'ATTACKER',
        }),
        expect.objectContaining({ name: 'Absent Player' }),
      ]),
    );

    request.operation.options.overrideTeamNames = true;
    request.operation.options.overridePlayerNames = true;
    database.commitImport(request);
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: storedTeam.id }),
    ).toMatchObject({ id: storedTeam.id, name: 'Scraped team' });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        teamIds: [storedTeam.id],
        pageIndex: 0,
        pageSize: 25,
        search: 'Scraped',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({
      id: storedPlayer.id,
      name: 'Scraped Name',
      firstName: 'Scraped',
      lastName: 'Name',
    });
    database.close();
  });

  test('detaches absent teams while preserving their squads', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: { sourceId: 'GB1', name: 'League', sourceUrl: 'https://example.test/GB1' },
      teams: [
        {
          sourceId: '281',
          name: 'Detached team',
          sourceUrl: 'https://example.test/281',
          players: [{ sourceId: '1', name: 'Preserved player' }],
        },
      ],
    });
    const league = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    const team = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    const request = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize' as const,
        target: { entity: 'leagues' as const, id: league.id },
        options: {
          absentTeams: 'detach' as const,
          absentPlayers: 'delete' as const,
          overrideTeamNames: false,
          overridePlayerNames: false,
          teamLeagueConflicts: 'move' as const,
          playerTeamConflicts: 'move' as const,
        },
      },
      league: { sourceId: 'GB1', name: 'League', sourceUrl: 'https://example.test/GB1' },
      teams: [],
    };

    expect(database.previewImportChanges(request).changes).toEqual({
      leagues: { added: 0, updated: 1, preserved: 0, deleted: 0 },
      teams: { added: 0, updated: 0, preserved: 0, moved: 0, detached: 1, deleted: 0 },
      players: {
        added: 0,
        updated: 0,
        preserved: 0,
        moved: 0,
        deduplicated: 0,
        deleted: 0,
      },
    });
    expect(database.commitImport(request).changes.teams.detached).toBe(1);
    expect(database.getProjectSummary(project.id)).toMatchObject({ teamCount: 1, playerCount: 1 });
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
    ).toMatchObject({ leagueId: undefined, playerCount: 1 });
    expect(
      database.getEntity({ projectId: project.id, entity: 'leagues', id: league.id }),
    ).toMatchObject({ teamCount: 0 });
    database.close();
  });

  test('rolls back all synchronized updates and deletions when one row fails', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: { sourceId: 'GB1', name: 'Premier League', sourceUrl: 'https://example.test/GB1' },
      teams: [
        {
          sourceId: '281',
          name: 'Original team',
          sourceUrl: 'https://example.test/281',
          players: [{ sourceId: '1', name: 'Original player' }],
        },
        {
          sourceId: '985',
          name: 'Team that must survive rollback',
          sourceUrl: 'https://example.test/985',
          players: [{ sourceId: '2', name: 'Second player' }],
        },
      ],
    });
    const league = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];

    expect(() =>
      database.commitImport({
        projectId: project.id,
        sourceName: 'transfermarkt' as const,
        operation: {
          kind: 'synchronize',
          target: { entity: 'leagues', id: league.id },
          options: {
            absentTeams: 'delete',
            absentPlayers: 'delete',
            overrideTeamNames: true,
            overridePlayerNames: true,
            teamLeagueConflicts: 'move',
            playerTeamConflicts: 'move',
          },
        },
        league: {
          sourceId: 'GB1',
          name: 'Premier League changed',
          sourceUrl: 'https://example.test/GB1',
        },
        teams: [
          {
            sourceId: '281',
            name: 'Changed before failure',
            sourceUrl: 'https://example.test/281',
            players: [],
          },
          {
            sourceId: 'invalid',
            name: '',
            sourceUrl: 'https://example.test/invalid',
            players: [],
          },
        ],
      }),
    ).toThrow();
    expect(database.getProjectSummary(project.id)).toMatchObject({ teamCount: 2, playerCount: 2 });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Original team' }),
        expect.objectContaining({ name: 'Team that must survive rollback' }),
      ]),
    );
    database.close();
  });

  test('rejects invalid synchronization policies without changing stored data', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: '281',
          name: 'Stored team',
          sourceUrl: 'https://example.test/281',
          players: [{ sourceId: '1', name: 'Stored player' }],
        },
      ],
    });
    const team = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    const request = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize',
        target: { entity: 'teams', id: team.id },
        options: {
          absentPlayers: 'archive',
          overridePlayerNames: false,
          playerTeamConflicts: 'move',
        },
      },
      teams: [
        {
          sourceId: '281',
          name: 'Changed team',
          sourceUrl: 'https://example.test/281-changed',
          players: [],
        },
      ],
    } as unknown as CommitImportRequest;

    expect(() => database.previewImportChanges(request)).toThrow(ApplicationError);
    expect(() => database.commitImport(request)).toThrow(ApplicationError);
    expect(database.getProjectSummary(project.id)).toMatchObject({ teamCount: 1, playerCount: 1 });
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
    ).toMatchObject({ name: 'Stored team', playerCount: 1 });
    database.close();
  });

  test('edits source identity and team relationships with project-scoped validation', () => {
    const database = createDatabase();
    const project = database.createProject({ name: '2026/1', referenceDate: '2026-01-01' });
    const otherProject = database.createProject({ name: '2026/2', referenceDate: '2026-07-01' });
    const importLeague = (projectId: string, sourceId: string, name: string) =>
      database.commitImport({
        projectId,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        league: { sourceId, name, sourceUrl: `https://example.test/${sourceId}` },
        teams: [
          {
            sourceId: `${sourceId}-team`,
            name: `${name} team`,
            sourceUrl: `https://example.test/${sourceId}-team`,
            players: [],
          },
        ],
      });
    importLeague(project.id, 'GB1', 'Premier League');
    importLeague(project.id, 'GB2', 'Championship');
    importLeague(otherProject.id, 'DE1', 'Bundesliga');
    database.commitImport({
      projectId: project.id,
      sourceName: 'soccerway',
      operation: mergeOperation(),
      league: {
        sourceId: 'czech-republic/chance-liga/standings/bNFMkskm',
        name: 'Chance Liga',
        sourceUrl: 'https://example.test/chance-liga',
      },
      teams: [
        {
          sourceId: 'slavia-prague/viXGgnyB',
          name: 'Slavia Prague',
          sourceUrl: 'https://example.test/slavia-prague',
          players: [],
        },
      ],
    });
    const projectLeagues = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const premier = projectLeagues.find((league) => league.sourceId === 'GB1');
    const championship = projectLeagues.find((league) => league.sourceId === 'GB2');
    const chanceLiga = projectLeagues.find((league) => league.sourceName === 'soccerway');
    const bundesliga = database.listEntities({
      projectId: otherProject.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    if (!premier || !championship || !chanceLiga) throw new Error('League fixtures missing.');
    const updatedLeague = database.updateEntityMetadata({
      projectId: project.id,
      entity: 'leagues',
      id: premier.id,
      name: 'Premier League renamed',
      countryCode3: 'ENG',
      sourceId: 'GBX',
      season: '2026',
    });
    expect(updatedLeague).toMatchObject({
      id: premier.id,
      sourceId: 'GBX',
      countryName: 'England',
      countryCode2: 'GB',
      countryCode3: 'ENG',
      season: '2026',
      sourceUrl: 'https://www.transfermarkt.com/slug/startseite/wettbewerb/GBX/plus?saison_id=2026',
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: 'England',
        sort: 'leagueCountry',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ id: premier.id, countryCode3: 'ENG' })]);
    expect(() =>
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'leagues',
        id: premier.id,
        name: 'Invalid country',
        countryCode3: 'XXX',
        sourceId: 'GBX',
        season: '2026',
      }),
    ).toThrow('Choose a valid country or leave it empty.');
    const team = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: 'Premier',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    expect(
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: team.id,
        name: 'Moved team',
        countryCode3: 'CZE',
        sourceId: 'moved-team',
        season: '2026',
        leagueId: championship.id,
      }),
    ).toMatchObject({
      id: team.id,
      leagueId: championship.id,
      sourceId: 'moved-team',
      countryName: 'Czech Republic',
      countryCode2: 'CZ',
      countryCode3: 'CZE',
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'teams',
        pageIndex: 0,
        pageSize: 25,
        search: 'Czech Republic',
        sort: 'teamCountry',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ id: team.id, countryCode3: 'CZE' })]);
    expect(() =>
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: team.id,
        name: 'Invalid country',
        countryCode3: 'XXX',
        sourceId: 'moved-team',
        season: '2026',
        leagueId: championship.id,
      }),
    ).toThrow('Choose a valid country or leave it empty.');
    expect(() =>
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: team.id,
        name: 'Invalid move',
        sourceId: 'moved-team',
        season: '2026',
        leagueId: bundesliga.id,
      }),
    ).toThrow(ApplicationError);
    expect(() =>
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: team.id,
        name: 'Invalid cross-source move',
        sourceId: 'moved-team',
        season: '2026',
        leagueId: chanceLiga.id,
      }),
    ).toThrow('A team can only belong to a league from the same provider.');
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
    ).toMatchObject({
      name: 'Moved team',
      sourceId: 'moved-team',
      leagueId: championship.id,
      countryCode3: 'CZE',
    });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt',
      operation: {
        kind: 'synchronize',
        target: { entity: 'teams', id: team.id },
        options: {
          absentPlayers: 'keep',
          overridePlayerNames: false,
          playerTeamConflicts: 'move',
        },
      },
      teams: [
        {
          sourceId: 'moved-team',
          name: 'Incoming team name',
          season: '2026',
          sourceUrl: 'https://example.test/team',
          players: [],
        },
      ],
    });
    expect(
      database.getEntity({ projectId: project.id, entity: 'teams', id: team.id }),
    ).toMatchObject({ countryCode3: 'CZE' });
    expect(
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'teams',
        id: team.id,
        name: 'Unassigned team',
        sourceId: 'moved-team',
        season: '2026',
      }),
    ).toMatchObject({ id: team.id, leagueId: undefined, countryCode3: undefined });
    expect(() =>
      database.updateEntityMetadata({
        projectId: project.id,
        entity: 'leagues',
        id: premier.id,
        name: 'Duplicate',
        sourceId: 'GB2',
      }),
    ).toThrow(ApplicationError);
    database.close();
  });

  test('previews and applies global keep or refresh policies for matching records', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Conflicts', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      league: { sourceId: 'GB1', name: 'Stored league', sourceUrl: 'https://old.test/league' },
      teams: [
        {
          sourceId: '281',
          name: 'Stored team',
          sourceUrl: 'https://old.test/team',
          players: [
            {
              sourceId: '10',
              name: 'Stored player',
              position: 'DEFENDER',
              positionDetail: 'CB',
            },
          ],
        },
      ],
    });
    const request: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'merge',
        options: {
          existingRecords: 'keep',
          teamLeagueConflicts: 'move',
          playerTeamConflicts: 'move',
        },
      },
      league: { sourceId: 'GB1', name: 'Fresh league', sourceUrl: 'https://new.test/league' },
      teams: [
        {
          sourceId: '281',
          name: 'Fresh team',
          sourceUrl: 'https://new.test/team',
          players: [
            {
              sourceId: '10',
              name: 'Fresh player',
              position: 'ATTACKER',
              positionDetail: 'ST',
            },
          ],
        },
      ],
    };

    const preview = database.previewImportChanges(request);
    expect(preview.conflicts.existingRecords).toHaveLength(3);
    expect(preview.changes).toMatchObject({
      leagues: { preserved: 1 },
      teams: { preserved: 1 },
      players: { preserved: 1 },
    });
    database.commitImport(request);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({
      name: 'Stored league',
      sourceUrl: 'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1',
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({ name: 'Stored player', position: 'DEFENDER', positionDetail: 'CB' });

    if (request.operation.kind !== 'merge') throw new Error('Expected merge operation.');
    request.operation.options.existingRecords = 'refresh';
    database.commitImport(request);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'leagues',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({
      name: 'Fresh league',
      sourceUrl: 'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1',
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows[0],
    ).toMatchObject({ name: 'Fresh player', position: 'ATTACKER', positionDetail: 'ST' });
    database.close();
  });

  test('keeps or moves team and player ownership without creating player copies', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Ownership', referenceDate: '2026-01-01' });
    const importLeague = (leagueId: string, teamId: string, playerId?: string) =>
      database.commitImport({
        projectId: project.id,
        sourceName: 'transfermarkt' as const,
        operation: mergeOperation(),
        league: { sourceId: leagueId, name: `League ${leagueId}`, sourceUrl: leagueId },
        teams: [
          {
            sourceId: teamId,
            name: `Team ${teamId}`,
            sourceUrl: teamId,
            players: playerId ? [{ sourceId: playerId, name: 'Shared player' }] : [],
          },
        ],
      });
    importLeague('A', 'team-a', 'player');
    importLeague('B', 'team-b');
    const leagues = database.listEntities({
      projectId: project.id,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const leagueA = leagues.find((league) => league.sourceId === 'A');
    const leagueB = leagues.find((league) => league.sourceId === 'B');
    if (!leagueA || !leagueB) throw new Error('Expected test leagues.');
    const teamMove: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'merge',
        options: {
          existingRecords: 'refresh',
          teamLeagueConflicts: 'keep',
          playerTeamConflicts: 'move',
        },
      },
      league: { sourceId: 'B', name: 'League B', sourceUrl: 'B' },
      teams: [{ sourceId: 'team-a', name: 'Team A', sourceUrl: 'team-a', players: [] }],
    };
    expect(database.previewImportChanges(teamMove).conflicts.teamLeagueConflicts).toHaveLength(1);
    database.commitImport(teamMove);
    const findTeam = (sourceId: string) =>
      database
        .listEntities({
          projectId: project.id,
          entity: 'teams',
          pageIndex: 0,
          pageSize: 25,
          search: sourceId,
          sort: 'name',
          direction: 'asc',
        })
        .rows.find((team) => team.sourceId === sourceId);
    expect(findTeam('team-a')).toMatchObject({ leagueId: leagueA.id });
    if (teamMove.operation.kind !== 'merge') throw new Error('Expected merge operation.');
    teamMove.operation.options.teamLeagueConflicts = 'move';
    database.commitImport(teamMove);
    expect(findTeam('team-a')).toMatchObject({ leagueId: leagueB.id });

    const playerMove: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'merge',
        options: {
          existingRecords: 'refresh',
          teamLeagueConflicts: 'move',
          playerTeamConflicts: 'keep',
        },
      },
      teams: [
        {
          sourceId: 'team-b',
          name: 'Team B',
          sourceUrl: 'team-b',
          players: [{ sourceId: 'player', name: 'Shared player' }],
        },
      ],
    };
    expect(database.previewImportChanges(playerMove).conflicts.playerTeamConflicts).toHaveLength(1);
    database.commitImport(playerMove);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ teamId: findTeam('team-a')?.id })]);
    playerMove.operation.options.playerTeamConflicts = 'move';
    database.commitImport(playerMove);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ teamId: findTeam('team-b')?.id })]);

    const leagueSync: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize',
        target: { entity: 'leagues', id: leagueA.id },
        options: {
          absentTeams: 'keep',
          absentPlayers: 'keep',
          overrideTeamNames: false,
          overridePlayerNames: false,
          teamLeagueConflicts: 'keep',
          playerTeamConflicts: 'keep',
        },
      },
      league: { sourceId: 'A', name: 'League A', sourceUrl: 'A' },
      teams: [{ sourceId: 'team-a', name: 'Team A', sourceUrl: 'team-a', players: [] }],
    };
    expect(database.previewImportChanges(leagueSync).conflicts.teamLeagueConflicts).toHaveLength(1);
    database.commitImport(leagueSync);
    expect(findTeam('team-a')).toMatchObject({ leagueId: leagueB.id });
    if (
      leagueSync.operation.kind !== 'synchronize' ||
      !('teamLeagueConflicts' in leagueSync.operation.options)
    ) {
      throw new Error('Expected league synchronization.');
    }
    leagueSync.operation.options.teamLeagueConflicts = 'move';
    database.commitImport(leagueSync);
    expect(findTeam('team-a')).toMatchObject({ leagueId: leagueA.id });

    const teamA = findTeam('team-a');
    if (!teamA) throw new Error('Expected team A.');
    const teamSync: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'synchronize',
        target: { entity: 'teams', id: teamA.id },
        options: {
          absentPlayers: 'keep',
          overridePlayerNames: false,
          playerTeamConflicts: 'keep',
        },
      },
      teams: [
        {
          sourceId: 'team-a',
          name: 'Team A',
          sourceUrl: 'team-a',
          players: [{ sourceId: 'player', name: 'Shared player' }],
        },
      ],
    };
    expect(database.previewImportChanges(teamSync).conflicts.playerTeamConflicts).toHaveLength(1);
    database.commitImport(teamSync);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ teamId: findTeam('team-b')?.id })]);
    teamSync.operation.options.playerTeamConflicts = 'move';
    database.commitImport(teamSync);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ teamId: teamA.id })]);
    database.close();
  });

  test('consolidates legacy player copies on import and rejects ambiguous incoming squads', () => {
    const database = createDatabase();
    const project = database.createProject({ name: 'Legacy copies', referenceDate: '2026-01-01' });
    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'team-a',
          name: 'Team A',
          sourceUrl: 'team-a',
          players: [{ sourceId: 'player', name: 'Older copy' }],
        },
        { sourceId: 'team-b', name: 'Team B', sourceUrl: 'team-b', players: [] },
      ],
    });
    const teams = database.listEntities({
      projectId: project.id,
      entity: 'teams',
      pageIndex: 0,
      pageSize: 25,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows;
    const teamA = teams.find((team) => team.sourceId === 'team-a');
    const teamB = teams.find((team) => team.sourceId === 'team-b');
    if (!teamA || !teamB) throw new Error('Expected test teams.');
    const sqlite = (
      database as unknown as {
        database: {
          prepare(sql: string): { run(values: Record<string, string>): unknown };
        };
      }
    ).database;
    sqlite
      .prepare(
        `INSERT INTO players(
           id, project_id, team_id, source_name, source_id, name, created_at, updated_at
         )
         VALUES (
           $id, $projectId, $teamId, 'transfermarkt', $sourceId, $name, $createdAt, $updatedAt
         )`,
      )
      .run({
        id: 'legacy-copy',
        projectId: project.id,
        teamId: teamB.id,
        sourceId: 'player',
        name: 'Newest legacy copy',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2099-01-01T00:00:00.000Z',
      });
    const request: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: {
        kind: 'merge',
        options: {
          existingRecords: 'keep',
          teamLeagueConflicts: 'keep',
          playerTeamConflicts: 'keep',
        },
      },
      teams: [
        {
          sourceId: 'team-a',
          name: 'Team A',
          sourceUrl: 'team-a',
          players: [{ sourceId: 'player', name: 'Incoming player' }],
        },
      ],
    };
    const preview = database.previewImportChanges(request);
    expect(preview.conflicts.playerTeamConflicts[0]).toMatchObject({ legacyCopyCount: 2 });
    expect(preview.changes.players).toMatchObject({ moved: 1, deduplicated: 1 });
    database.commitImport(request);
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: '',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toEqual([expect.objectContaining({ name: 'Newest legacy copy', teamId: teamA.id })]);

    database.commitImport({
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'team-a',
          name: 'Team A',
          sourceUrl: 'team-a',
          players: [{ name: 'Unknown identity' }],
        },
        {
          sourceId: 'team-b',
          name: 'Team B',
          sourceUrl: 'team-b',
          players: [{ name: 'Unknown identity' }],
        },
      ],
    });
    expect(
      database.listEntities({
        projectId: project.id,
        entity: 'players',
        pageIndex: 0,
        pageSize: 25,
        search: 'Unknown identity',
        sort: 'name',
        direction: 'asc',
      }).rows,
    ).toHaveLength(2);

    const duplicateRequest: CommitImportRequest = {
      projectId: project.id,
      sourceName: 'transfermarkt' as const,
      operation: mergeOperation(),
      teams: [
        {
          sourceId: 'team-a',
          name: 'Team A',
          sourceUrl: 'team-a',
          players: [{ sourceId: 'duplicate', name: 'Duplicate player' }],
        },
        {
          sourceId: 'team-b',
          name: 'Team B',
          sourceUrl: 'team-b',
          players: [{ sourceId: 'duplicate', name: 'Duplicate player' }],
        },
      ],
    };
    expect(() => database.previewImportChanges(duplicateRequest)).toThrow(
      /selected for multiple teams/,
    );
    database.close();
  });
});
