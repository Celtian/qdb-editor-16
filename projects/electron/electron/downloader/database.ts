import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  isSourceName,
  leagueTiers,
  playerPositionDetails,
  sourceLabels,
  sourceNames,
  sourceSupportsSeason,
  type CommitImportRequest,
  type CombinedEntity,
  type CombinedEntityFilterOptions,
  type CombinedEntityFilterOptionsRequest,
  type CombinedEntityKind,
  type CombinedLeague,
  type CombinedPageRequest,
  type CombinedPlayer,
  type CombinedSourceRef,
  type CombinedTeam,
  type CombineTeamCandidate,
  type CommitTeamCombinationRequest,
  type CountryFilterOption,
  type CreateCombinedCustomBadgeRequest,
  type CreateCustomBadgeRequest,
  type DeleteCombinedCustomBadgeResult,
  type DeleteCombinedLeaguesRequest,
  type DeleteCombinedPlayersRequest,
  type DeleteCombinedTeamsRequest,
  type DeleteCustomBadgeResult,
  type DeleteLeagueRequest,
  type DeleteLeaguesRequest,
  type DeletePlayersRequest,
  type DeleteSourceDataRequest,
  type DeleteSourceDataResult,
  type DeleteTeamsRequest,
  type EditableEntity,
  type EditableEntityKind,
  type Entity,
  type EntityKind,
  type EntityFilterOptions,
  type EntityFilterOptionsRequest,
  type ExportConfigurationPreference,
  type ExportColumnSelection,
  type ExportFieldNameConfiguration,
  type ExportFieldNamePresetPreference,
  type ExportVisibilityPresetPreference,
  type ImportConflictSummary,
  type ImportChangeSummary,
  type ImportPreview,
  type ImportResult,
  type ImportTeam,
  type FieldConflict,
  type FieldResolutions,
  type LeagueSynchronizeImportOperation,
  type League,
  type NationalityFilterOption,
  type Page,
  type PageRequest,
  type Player,
  type PlayerInput,
  type Project,
  type ProjectSummary,
  type PlayerMatchGroup,
  type PlayerSourceRecord,
  type SourceDataDeletionCounts,
  type SourceName,
  type Team,
  type TeamCombinationPreview,
  type TeamCombinationResult,
  type SynchronizeImportOperation,
  type UpdateEntityMetadataRequest,
  type UpdateCustomBadgeRequest,
  type UpdateCombinedCustomBadgeRequest,
  type UpdateCombinedEntityCustomBadgesRequest,
  type UpdateCombinedEntityCustomBadgesResult,
  type UpdateEntityCustomBadgesRequest,
  type UpdateEntityCustomBadgesResult,
  type UpdateLeagueCountriesRequest,
  type UpdateLeagueTiersRequest,
  type UpdateTeamCountriesRequest,
} from '../../shared/downloader/contracts.js';
import {
  cloneExportColumns,
  cloneExportFieldNames,
  validateExportColumns,
  validateExportFieldNames,
} from '../../shared/downloader/export-schema.js';
import type {
  CombinedCustomBadge,
  CombinedCustomBadgeSummary,
} from '../../shared/downloader/combined-custom-badge.js';
import {
  collectPlayerConflicts,
  defaultSourcePriority,
  identifyPlayers,
  normalizePersonName,
  normalizeSourcePriority,
  resolveNameValue,
  resolvePlayer,
  resolveValue,
} from '../../shared/downloader/combined-data.js';
import {
  customBadgeLimits,
  isCustomBadgeColor,
  type CustomBadge,
  type CustomBadgeColor,
  type CustomBadgeSummary,
} from '../../shared/downloader/custom-badge.js';
import {
  createEntityStatusThresholds,
  normalizeEntityStatus,
} from '../../shared/downloader/entity-status.js';
import { findFootballCountryByCode3 } from '../../shared/downloader/football-countries.js';
import { isReferenceDate } from '../../shared/downloader/reference-date.js';
import { ApplicationError } from './errors.js';
import { parseSourceIdentifier } from './scraper.js';
import { buildSourceUrl } from './source-url.js';

type Row = Record<string, string | number | null>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isLeagueSynchronization = (
  operation: SynchronizeImportOperation,
): operation is LeagueSynchronizeImportOperation => operation.target.entity === 'leagues';

const entitySortColumns = {
  leagues: {
    sourceName: 'source_name',
    name: 'name',
    tier: 'tier',
    leagueCountry: 'country_name',
    sourceId: 'source_id',
    season: 'season',
    teamCount: 'team_count',
    sourceUrl: 'source_name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  teams: {
    sourceName: 'source_name',
    name: 'name',
    leagueName: 'league_name COLLATE NOCASE',
    teamCountry: 'country_name',
    sourceId: 'source_id',
    season: 'season',
    playerCount: 'player_count',
    sourceUrl: 'source_name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  players: {
    sourceName: 'source_name',
    name: 'name',
    teamName: 'team_name COLLATE NOCASE',
    leagueName: 'league_name COLLATE NOCASE',
    sourceId: 'source_id',
    countryName: 'country_name',
    jerseyNumber: 'jersey_number',
    position: 'position',
    positionDetail: 'position_detail',
    birthdate: 'birthdate',
    height: 'height',
    weight: 'weight',
    foot: 'foot',
    joined: 'joined',
    contractExpires: 'contract_expires',
    marketValue: 'market_value',
    sourceUrl: 'source_name',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
} as const;

const playerPositions = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'ATTACKER'] as const;
const playerFeet = ['LEFT', 'RIGHT'] as const;
const exportDestinationPreferenceKey = 'export_destination';
const sourcePriorityPreferenceKey = 'source_priority';
const exportConfigurationPreferenceKey = 'export.configuration';
const exportVisibilityPresetsPreferenceKey = 'export.visibility-presets';
const exportFieldNamePresetsPreferenceKey = 'export.field-name-presets';
const exportPresetIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

const validateExportPresetMetadata = (
  presets: readonly { id: string; name: string }[],
  reservedIds: ReadonlySet<string>,
  reservedNames: ReadonlySet<string>,
): void => {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const preset of presets) {
    const normalizedName = preset.name.toLocaleLowerCase();
    if (
      !exportPresetIdPattern.test(preset.id) ||
      preset.name !== preset.name.trim() ||
      preset.name.length === 0 ||
      preset.name.length > 60 ||
      reservedIds.has(preset.id) ||
      reservedNames.has(normalizedName) ||
      ids.has(preset.id) ||
      names.has(normalizedName)
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Export preset IDs and names must be valid and unique.',
      });
    }
    ids.add(preset.id);
    names.add(normalizedName);
  }
};

const customBadgeAssignmentTables = {
  leagues: { table: 'league_custom_badges', entityIdColumn: 'league_id' },
  teams: { table: 'team_custom_badges', entityIdColumn: 'team_id' },
  players: { table: 'player_custom_badges', entityIdColumn: 'player_id' },
} as const;
const combinedCustomBadgeAssignmentTables = {
  leagues: {
    table: 'combined_league_custom_badges',
    entityIdColumn: 'combined_league_id',
  },
  teams: {
    table: 'combined_team_custom_badges',
    entityIdColumn: 'combined_team_id',
  },
  players: {
    table: 'combined_player_custom_badges',
    entityIdColumn: 'combined_player_id',
  },
} as const;

const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const optionalString = (value: string | number | null): string | undefined =>
  value === null || String(value) === '' ? undefined : String(value);
const optionalNumber = (value: string | number | null | undefined): number | undefined =>
  value == null ? undefined : Number(value);
const teamIdentity = (sourceId: string, season: string | undefined): string =>
  `${sourceId}\u0000${season ?? ''}`;
const playerIdentity = (player: PlayerInput): string =>
  player.sourceId ?? `name:${player.name.trim().toLocaleLowerCase('en')}`;
const isStablePlayerIdentity = (
  player: PlayerInput,
): player is PlayerInput & { sourceId: string } => Boolean(player.sourceId);
const emptyChanges = (): ImportChangeSummary => ({
  leagues: { added: 0, updated: 0, preserved: 0, deleted: 0 },
  teams: { added: 0, updated: 0, preserved: 0, moved: 0, detached: 0, deleted: 0 },
  players: { added: 0, updated: 0, preserved: 0, moved: 0, deduplicated: 0, deleted: 0 },
});
const emptyConflicts = (): ImportConflictSummary => ({
  existingRecords: [],
  teamLeagueConflicts: [],
  playerTeamConflicts: [],
});

export class SnapshotDatabase {
  private readonly database: DatabaseSync;
  private readonly migrationTable: 'schema_migrations' | 'downloader_schema_migrations';

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
    const catalogMode = Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'databases'")
        .get(),
    );
    if (
      catalogMode &&
      this.tableExists('schema_migrations') &&
      !this.tableExists('downloader_schema_migrations') &&
      this.tableExists('leagues')
    ) {
      this.database.exec('ALTER TABLE schema_migrations RENAME TO downloader_schema_migrations');
    }
    this.migrationTable = catalogMode ? 'downloader_schema_migrations' : 'schema_migrations';
    this.migrate();
  }

  close(): void {
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT
    `);
    let version = Number(
      (
        this.database
          .prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM ${this.migrationTable}`)
          .get() as Row
      )['version'],
    );
    if (version < 1)
      this.transaction(() => {
        this.database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 80),
          reference_date TEXT NOT NULL CHECK(reference_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE leagues (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          source TEXT NOT NULL CHECK(source = 'transfermarkt'),
          external_id TEXT NOT NULL,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
          name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
          name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
        CREATE INDEX leagues_project_name ON leagues(project_id, name COLLATE NOCASE);
        CREATE INDEX teams_project_name ON teams(project_id, name COLLATE NOCASE);
        CREATE INDEX teams_league ON teams(league_id);
        CREATE INDEX players_project_name ON players(project_id, name COLLATE NOCASE);
        CREATE INDEX players_team ON players(team_id);
      `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 1, appliedAt: new Date().toISOString() });
      });
    if (version < 1) version = 1;
    if (version < 2) {
      this.transaction(() => {
        this.database.exec(
          `CREATE INDEX IF NOT EXISTS players_project_external
           ON players(project_id, source, external_id)`,
        );
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 2, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 3) {
      this.transaction(() => {
        this.database.exec('ALTER TABLE players ADD COLUMN position_detail TEXT');
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 3, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 4) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE leagues_v4 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            season TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, source_name, source_id, season)
          ) STRICT;
          CREATE TABLE teams_v4 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            league_id TEXT REFERENCES leagues_v4(id) ON DELETE SET NULL,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            season TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, source_name, source_id, season)
          ) STRICT;
          CREATE TABLE players_v4 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL REFERENCES teams_v4(id) ON DELETE CASCADE,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
          INSERT INTO leagues_v4(
            id, project_id, source_name, source_id, name, season, created_at, updated_at
          )
          SELECT id, project_id, source, external_id, name, season, created_at, updated_at
          FROM leagues;
          INSERT INTO teams_v4(
            id, project_id, league_id, source_name, source_id, name, season, created_at, updated_at
          )
          SELECT id, project_id, league_id, source, external_id, name, season, created_at, updated_at
          FROM teams;
          INSERT INTO players_v4(
            id, project_id, team_id, source_name, source_id, name, first_name, last_name,
            jersey_number, position, birthdate, height, weight, foot, joined, contract_expires,
            market_value, country_name, country_code2, country_code3, minutes_played, created_at,
            updated_at, position_detail
          )
          SELECT id, project_id, team_id, source, external_id, name, first_name, last_name,
            jersey_number, position, birthdate, height, weight, foot, joined, contract_expires,
            market_value, country_name, country_code2, country_code3, minutes_played, created_at,
            updated_at, position_detail
          FROM players;
          DROP TABLE players;
          DROP TABLE teams;
          DROP TABLE leagues;
          ALTER TABLE leagues_v4 RENAME TO leagues;
          ALTER TABLE teams_v4 RENAME TO teams;
          ALTER TABLE players_v4 RENAME TO players;
          CREATE INDEX leagues_project_name ON leagues(project_id, name COLLATE NOCASE);
          CREATE INDEX teams_project_name ON teams(project_id, name COLLATE NOCASE);
          CREATE INDEX teams_league ON teams(league_id);
          CREATE INDEX players_project_name ON players(project_id, name COLLATE NOCASE);
          CREATE INDEX players_team ON players(team_id);
          CREATE INDEX players_project_source
            ON players(project_id, source_name, source_id);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 4, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 4) version = 4;
    if (version < 5) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE leagues_v5 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            season TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, source_name, source_id, season)
          ) STRICT;
          CREATE TABLE teams_v5 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            league_id TEXT REFERENCES leagues_v5(id) ON DELETE SET NULL,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            season TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, source_name, source_id, season)
          ) STRICT;
          CREATE TABLE players_v5 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL REFERENCES teams_v5(id) ON DELETE CASCADE,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
          INSERT INTO leagues_v5
          SELECT * FROM leagues;
          INSERT INTO teams_v5
          SELECT * FROM teams;
          INSERT INTO players_v5
          SELECT * FROM players;
          DROP TABLE players;
          DROP TABLE teams;
          DROP TABLE leagues;
          ALTER TABLE leagues_v5 RENAME TO leagues;
          ALTER TABLE teams_v5 RENAME TO teams;
          ALTER TABLE players_v5 RENAME TO players;
          CREATE INDEX leagues_project_name ON leagues(project_id, name COLLATE NOCASE);
          CREATE INDEX teams_project_name ON teams(project_id, name COLLATE NOCASE);
          CREATE INDEX teams_league ON teams(league_id);
          CREATE INDEX players_project_name ON players(project_id, name COLLATE NOCASE);
          CREATE INDEX players_team ON players(team_id);
          CREATE INDEX players_project_source
            ON players(project_id, source_name, source_id);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 5, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 5) version = 5;
    if (version < 6) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE leagues_v6 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball', 'eurofotbal')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            season TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, source_name, source_id, season)
          ) STRICT;
          CREATE TABLE teams_v6 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            league_id TEXT REFERENCES leagues_v6(id) ON DELETE SET NULL,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball', 'eurofotbal')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            season TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, source_name, source_id, season)
          ) STRICT;
          CREATE TABLE players_v6 (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL REFERENCES teams_v6(id) ON DELETE CASCADE,
            source_name TEXT NOT NULL CHECK(source_name IN ('transfermarkt', 'soccerway', 'worldfootball', 'eurofotbal')),
            source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
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
          INSERT INTO leagues_v6
          SELECT * FROM leagues;
          INSERT INTO teams_v6
          SELECT * FROM teams;
          INSERT INTO players_v6
          SELECT * FROM players;
          DROP TABLE players;
          DROP TABLE teams;
          DROP TABLE leagues;
          ALTER TABLE leagues_v6 RENAME TO leagues;
          ALTER TABLE teams_v6 RENAME TO teams;
          ALTER TABLE players_v6 RENAME TO players;
          CREATE INDEX leagues_project_name ON leagues(project_id, name COLLATE NOCASE);
          CREATE INDEX teams_project_name ON teams(project_id, name COLLATE NOCASE);
          CREATE INDEX teams_league ON teams(league_id);
          CREATE INDEX players_project_name ON players(project_id, name COLLATE NOCASE);
          CREATE INDEX players_team ON players(team_id);
          CREATE INDEX players_project_source
            ON players(project_id, source_name, source_id);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 6, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 6) version = 6;
    if (version < 7) {
      this.transaction(() => {
        this.database.exec(`
          ALTER TABLE leagues ADD COLUMN country_name TEXT
            CHECK(country_name IS NULL OR length(trim(country_name)) > 0);
          ALTER TABLE leagues ADD COLUMN country_code2 TEXT
            CHECK(country_code2 IS NULL OR length(country_code2) = 2);
          ALTER TABLE leagues ADD COLUMN country_code3 TEXT
            CHECK(country_code3 IS NULL OR length(country_code3) = 3);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 7, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 7) version = 7;
    if (version < 8) {
      this.transaction(() => {
        this.database.exec(`
          ALTER TABLE teams ADD COLUMN country_name TEXT
            CHECK(country_name IS NULL OR length(trim(country_name)) > 0);
          ALTER TABLE teams ADD COLUMN country_code2 TEXT
            CHECK(country_code2 IS NULL OR length(country_code2) = 2);
          ALTER TABLE teams ADD COLUMN country_code3 TEXT
            CHECK(country_code3 IS NULL OR length(country_code3) = 3);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 8, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 8) version = 8;
    if (version < 9) {
      this.transaction(() => {
        this.database.exec(`
          ALTER TABLE leagues ADD COLUMN tier INTEGER
            CHECK(tier IS NULL OR (tier BETWEEN 1 AND 10 AND typeof(tier) = 'integer'));
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 9, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 9) version = 9;
    if (version < 10) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE application_preferences (
            key TEXT PRIMARY KEY CHECK(length(trim(key)) > 0),
            value TEXT NOT NULL
          ) STRICT;
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 10, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 10) version = 10;
    if (version < 11) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE custom_badges (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE
              CHECK(length(trim(name)) BETWEEN 1 AND 40),
            description TEXT NOT NULL
              CHECK(length(trim(description)) BETWEEN 1 AND 200),
            color TEXT NOT NULL
              CHECK(color IN ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE league_custom_badges (
            badge_id TEXT NOT NULL REFERENCES custom_badges(id) ON DELETE CASCADE,
            league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
            PRIMARY KEY (badge_id, league_id)
          ) STRICT;
          CREATE TABLE team_custom_badges (
            badge_id TEXT NOT NULL REFERENCES custom_badges(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            PRIMARY KEY (badge_id, team_id)
          ) STRICT;
          CREATE TABLE player_custom_badges (
            badge_id TEXT NOT NULL REFERENCES custom_badges(id) ON DELETE CASCADE,
            player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            PRIMARY KEY (badge_id, player_id)
          ) STRICT;
          CREATE INDEX league_custom_badges_entity ON league_custom_badges(league_id);
          CREATE INDEX team_custom_badges_entity ON team_custom_badges(team_id);
          CREATE INDEX player_custom_badges_entity ON player_custom_badges(player_id);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 11, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 11) version = 11;
    if (version < 12) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE combined_leagues (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            tier INTEGER CHECK(tier IS NULL OR (tier BETWEEN 1 AND 10 AND typeof(tier) = 'integer')),
            country_name TEXT,
            country_code2 TEXT CHECK(country_code2 IS NULL OR length(country_code2) = 2),
            country_code3 TEXT CHECK(country_code3 IS NULL OR length(country_code3) = 3),
            season TEXT NOT NULL DEFAULT '',
            resolutions TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(resolutions)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE combined_teams (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            league_id TEXT REFERENCES combined_leagues(id) ON DELETE SET NULL,
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            country_name TEXT,
            country_code2 TEXT CHECK(country_code2 IS NULL OR length(country_code2) = 2),
            country_code3 TEXT CHECK(country_code3 IS NULL OR length(country_code3) = 3),
            season TEXT NOT NULL DEFAULT '',
            resolutions TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(resolutions)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE combined_players (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            team_id TEXT NOT NULL REFERENCES combined_teams(id) ON DELETE CASCADE,
            name TEXT NOT NULL CHECK(length(trim(name)) > 0),
            first_name TEXT,
            last_name TEXT,
            jersey_number INTEGER,
            position TEXT,
            position_detail TEXT,
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
            resolutions TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(resolutions)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE combined_league_sources (
            id TEXT PRIMARY KEY,
            combined_league_id TEXT NOT NULL REFERENCES combined_leagues(id) ON DELETE CASCADE,
            source_league_id TEXT UNIQUE REFERENCES leagues(id) ON DELETE SET NULL,
            source_name TEXT NOT NULL,
            source_id TEXT NOT NULL,
            season TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            UNIQUE(combined_league_id, source_name)
          ) STRICT;
          CREATE TABLE combined_team_sources (
            id TEXT PRIMARY KEY,
            combined_team_id TEXT NOT NULL REFERENCES combined_teams(id) ON DELETE CASCADE,
            source_team_id TEXT UNIQUE REFERENCES teams(id) ON DELETE SET NULL,
            source_name TEXT NOT NULL,
            source_id TEXT NOT NULL,
            season TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            UNIQUE(combined_team_id, source_name)
          ) STRICT;
          CREATE TABLE combined_player_sources (
            id TEXT PRIMARY KEY,
            combined_player_id TEXT NOT NULL REFERENCES combined_players(id) ON DELETE CASCADE,
            source_player_id TEXT UNIQUE REFERENCES players(id) ON DELETE SET NULL,
            source_name TEXT NOT NULL,
            source_id TEXT NOT NULL,
            name TEXT NOT NULL,
            UNIQUE(combined_player_id, source_name)
          ) STRICT;
          CREATE INDEX combined_leagues_project_name
            ON combined_leagues(project_id, name COLLATE NOCASE);
          CREATE INDEX combined_teams_project_name
            ON combined_teams(project_id, name COLLATE NOCASE);
          CREATE INDEX combined_teams_league ON combined_teams(league_id);
          CREATE INDEX combined_players_project_name
            ON combined_players(project_id, name COLLATE NOCASE);
          CREATE INDEX combined_players_team ON combined_players(team_id);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 12, appliedAt: new Date().toISOString() });
      });
    }
    if (version < 12) version = 12;
    if (version < 13) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE combined_custom_badges (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE
              CHECK(length(trim(name)) BETWEEN 1 AND 40),
            description TEXT NOT NULL
              CHECK(length(trim(description)) BETWEEN 1 AND 200),
            color TEXT NOT NULL
              CHECK(color IN ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE combined_league_custom_badges (
            badge_id TEXT NOT NULL REFERENCES combined_custom_badges(id) ON DELETE CASCADE,
            combined_league_id TEXT NOT NULL REFERENCES combined_leagues(id) ON DELETE CASCADE,
            PRIMARY KEY (badge_id, combined_league_id)
          ) STRICT;
          CREATE TABLE combined_team_custom_badges (
            badge_id TEXT NOT NULL REFERENCES combined_custom_badges(id) ON DELETE CASCADE,
            combined_team_id TEXT NOT NULL REFERENCES combined_teams(id) ON DELETE CASCADE,
            PRIMARY KEY (badge_id, combined_team_id)
          ) STRICT;
          CREATE TABLE combined_player_custom_badges (
            badge_id TEXT NOT NULL REFERENCES combined_custom_badges(id) ON DELETE CASCADE,
            combined_player_id TEXT NOT NULL REFERENCES combined_players(id) ON DELETE CASCADE,
            PRIMARY KEY (badge_id, combined_player_id)
          ) STRICT;
          CREATE INDEX combined_league_custom_badges_entity
            ON combined_league_custom_badges(combined_league_id);
          CREATE INDEX combined_team_custom_badges_entity
            ON combined_team_custom_badges(combined_team_id);
          CREATE INDEX combined_player_custom_badges_entity
            ON combined_player_custom_badges(combined_player_id);
        `);
        this.database
          .prepare(
            `INSERT INTO ${this.migrationTable}(version, applied_at) VALUES ($version, $appliedAt)`,
          )
          .run({ version: 13, appliedAt: new Date().toISOString() });
      });
    }
  }

  listCustomBadges(): CustomBadgeSummary[] {
    const rows = this.database
      .prepare(
        `SELECT badges.*,
         (
           (SELECT count(*) FROM league_custom_badges WHERE badge_id = badges.id) +
           (SELECT count(*) FROM team_custom_badges WHERE badge_id = badges.id) +
           (SELECT count(*) FROM player_custom_badges WHERE badge_id = badges.id)
         ) AS assignment_count
         FROM custom_badges badges
         ORDER BY badges.name COLLATE NOCASE ASC, badges.id ASC`,
      )
      .all() as Row[];
    return rows.map((row) => ({
      ...this.toCustomBadge(row),
      assignmentCount: Number(row['assignment_count']),
    }));
  }

  createCustomBadge(request: CreateCustomBadgeRequest): CustomBadgeSummary {
    const value = this.normalizeCustomBadgeInput(request);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    try {
      this.database
        .prepare(
          `INSERT INTO custom_badges(id, name, description, color, created_at, updated_at)
           VALUES ($id, $name, $description, $color, $now, $now)`,
        )
        .run({ id, ...value, now });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: 'A custom badge with this name already exists.',
        });
      }
      throw error;
    }
    return { id, ...value, assignmentCount: 0 };
  }

  updateCustomBadge(request: UpdateCustomBadgeRequest): CustomBadgeSummary {
    const value = this.normalizeCustomBadgeInput(request);
    const existing = this.listCustomBadges().find(({ id }) => id === request.id);
    if (!existing) {
      throw new ApplicationError({ code: 'NOT_FOUND', message: 'Custom badge was not found.' });
    }
    try {
      this.database
        .prepare(
          `UPDATE custom_badges
           SET name = $name, description = $description, color = $color, updated_at = $updatedAt
           WHERE id = $id`,
        )
        .run({ id: request.id, ...value, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: 'A custom badge with this name already exists.',
        });
      }
      throw error;
    }
    return { id: request.id, ...value, assignmentCount: existing.assignmentCount };
  }

  deleteCustomBadge(id: string): DeleteCustomBadgeResult {
    const badge = this.listCustomBadges().find((candidate) => candidate.id === id);
    if (!badge) {
      throw new ApplicationError({ code: 'NOT_FOUND', message: 'Custom badge was not found.' });
    }
    this.database.prepare('DELETE FROM custom_badges WHERE id = $id').run({ id });
    return { id, deletedAssignmentCount: badge.assignmentCount };
  }

  updateEntityCustomBadges(
    request: UpdateEntityCustomBadgesRequest,
  ): UpdateEntityCustomBadgesResult {
    if (!['leagues', 'teams', 'players'].includes(request.entity)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The requested table is invalid.',
      });
    }
    const selection = this.prepareEntitySelection(request.entity, request.projectId, request.ids);
    if (
      !Array.isArray(request.addBadgeIds) ||
      !Array.isArray(request.removeBadgeIds) ||
      !request.addBadgeIds.every((id) => typeof id === 'string') ||
      !request.removeBadgeIds.every((id) => typeof id === 'string')
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose valid custom badges to update.',
      });
    }
    const addBadgeIds = uniqueStrings(request.addBadgeIds);
    const removeBadgeIds = uniqueStrings(request.removeBadgeIds);
    const changedBadgeIds = [...new Set([...addBadgeIds, ...removeBadgeIds])];
    if (addBadgeIds.some((id) => removeBadgeIds.includes(id))) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'A custom badge cannot be added and removed in the same update.',
      });
    }
    if (changedBadgeIds.length) {
      const parameters: Record<string, string> = {};
      const placeholders = changedBadgeIds.map((id, index) => {
        const key = `badgeId${index}`;
        parameters[key] = id;
        return `$${key}`;
      });
      const count = Number(
        (
          this.database
            .prepare(
              `SELECT count(*) AS count FROM custom_badges WHERE id IN (${placeholders.join(', ')})`,
            )
            .get(parameters) as Row
        )['count'],
      );
      if (count !== changedBadgeIds.length) {
        throw new ApplicationError({
          code: 'NOT_FOUND',
          message: 'One or more custom badges were not found.',
        });
      }
    }
    const entityIds = Object.entries(selection.parameters)
      .filter(([key]) => key !== 'projectId')
      .map(([, id]) => id);
    const { table, entityIdColumn } = customBadgeAssignmentTables[request.entity];
    this.transaction(() => {
      const insert = this.database.prepare(
        `INSERT OR IGNORE INTO ${table}(badge_id, ${entityIdColumn})
         VALUES ($badgeId, $entityId)`,
      );
      const remove = this.database.prepare(
        `DELETE FROM ${table} WHERE badge_id = $badgeId AND ${entityIdColumn} = $entityId`,
      );
      for (const entityId of entityIds) {
        for (const badgeId of addBadgeIds) insert.run({ badgeId, entityId });
        for (const badgeId of removeBadgeIds) remove.run({ badgeId, entityId });
      }
    });
    return { updatedEntityCount: entityIds.length };
  }

  listCombinedCustomBadges(): CombinedCustomBadgeSummary[] {
    const rows = this.database
      .prepare(
        `SELECT badges.*,
         (
           (SELECT count(*) FROM combined_league_custom_badges WHERE badge_id = badges.id) +
           (SELECT count(*) FROM combined_team_custom_badges WHERE badge_id = badges.id) +
           (SELECT count(*) FROM combined_player_custom_badges WHERE badge_id = badges.id)
         ) AS assignment_count
         FROM combined_custom_badges badges
         ORDER BY badges.name COLLATE NOCASE ASC, badges.id ASC`,
      )
      .all() as Row[];
    return rows.map((row) => ({
      ...this.toCombinedCustomBadge(row),
      assignmentCount: Number(row['assignment_count']),
    }));
  }

  createCombinedCustomBadge(request: CreateCombinedCustomBadgeRequest): CombinedCustomBadgeSummary {
    const value = this.normalizeCustomBadgeInput(request);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    try {
      this.database
        .prepare(
          `INSERT INTO combined_custom_badges(id, name, description, color, created_at, updated_at)
           VALUES ($id, $name, $description, $color, $now, $now)`,
        )
        .run({ id, ...value, now });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: 'A combined custom badge with this name already exists.',
        });
      }
      throw error;
    }
    return { id, ...value, assignmentCount: 0 };
  }

  updateCombinedCustomBadge(request: UpdateCombinedCustomBadgeRequest): CombinedCustomBadgeSummary {
    const value = this.normalizeCustomBadgeInput(request);
    const existing = this.listCombinedCustomBadges().find(({ id }) => id === request.id);
    if (!existing) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: 'Combined custom badge was not found.',
      });
    }
    try {
      this.database
        .prepare(
          `UPDATE combined_custom_badges
           SET name = $name, description = $description, color = $color, updated_at = $updatedAt
           WHERE id = $id`,
        )
        .run({ id: request.id, ...value, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: 'A combined custom badge with this name already exists.',
        });
      }
      throw error;
    }
    return { id: request.id, ...value, assignmentCount: existing.assignmentCount };
  }

  deleteCombinedCustomBadge(id: string): DeleteCombinedCustomBadgeResult {
    const badge = this.listCombinedCustomBadges().find((candidate) => candidate.id === id);
    if (!badge) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: 'Combined custom badge was not found.',
      });
    }
    this.database.prepare('DELETE FROM combined_custom_badges WHERE id = $id').run({ id });
    return { id, deletedAssignmentCount: badge.assignmentCount };
  }

  updateCombinedEntityCustomBadges(
    request: UpdateCombinedEntityCustomBadgesRequest,
  ): UpdateCombinedEntityCustomBadgesResult {
    if (!['leagues', 'teams', 'players'].includes(request.entity)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The requested combined table is invalid.',
      });
    }
    const selection = this.prepareCombinedEntitySelection(
      request.projectId,
      request.entity,
      request.ids,
    );
    if (
      !Array.isArray(request.addBadgeIds) ||
      !Array.isArray(request.removeBadgeIds) ||
      !request.addBadgeIds.every((id) => typeof id === 'string') ||
      !request.removeBadgeIds.every((id) => typeof id === 'string')
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose valid combined custom badges to update.',
      });
    }
    const addBadgeIds = uniqueStrings(request.addBadgeIds);
    const removeBadgeIds = uniqueStrings(request.removeBadgeIds);
    const changedBadgeIds = [...new Set([...addBadgeIds, ...removeBadgeIds])];
    if (addBadgeIds.some((id) => removeBadgeIds.includes(id))) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'A combined custom badge cannot be added and removed in the same update.',
      });
    }
    if (changedBadgeIds.length) {
      const parameters: Record<string, string> = {};
      const placeholders = changedBadgeIds.map((id, index) => {
        const key = `combinedBadgeId${index}`;
        parameters[key] = id;
        return `$${key}`;
      });
      const count = Number(
        (
          this.database
            .prepare(
              `SELECT count(*) AS count FROM combined_custom_badges
               WHERE id IN (${placeholders.join(', ')})`,
            )
            .get(parameters) as Row
        )['count'],
      );
      if (count !== changedBadgeIds.length) {
        throw new ApplicationError({
          code: 'NOT_FOUND',
          message: 'One or more combined custom badges were not found.',
        });
      }
    }
    const entityIds = Object.entries(selection.parameters)
      .filter(([key]) => key !== 'projectId')
      .map(([, id]) => id);
    const { table, entityIdColumn } = combinedCustomBadgeAssignmentTables[request.entity];
    this.transaction(() => {
      const insert = this.database.prepare(
        `INSERT OR IGNORE INTO ${table}(badge_id, ${entityIdColumn})
         VALUES ($badgeId, $entityId)`,
      );
      const remove = this.database.prepare(
        `DELETE FROM ${table} WHERE badge_id = $badgeId AND ${entityIdColumn} = $entityId`,
      );
      for (const entityId of entityIds) {
        for (const badgeId of addBadgeIds) insert.run({ badgeId, entityId });
        for (const badgeId of removeBadgeIds) remove.run({ badgeId, entityId });
      }
    });
    return { updatedEntityCount: entityIds.length };
  }

  getExportDestination(): string | undefined {
    const row = this.database
      .prepare('SELECT value FROM application_preferences WHERE key = $key')
      .get({ key: exportDestinationPreferenceKey }) as Row | undefined;
    return row ? String(row['value']) : undefined;
  }

  setExportDestination(destination: string): void {
    if (!destination.trim()) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a valid export folder.',
      });
    }
    this.database
      .prepare(
        `INSERT INTO application_preferences(key, value)
         VALUES ($key, $value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({ key: exportDestinationPreferenceKey, value: destination });
  }

  getExportConfiguration(): ExportConfigurationPreference | undefined {
    const row = this.database
      .prepare('SELECT value FROM application_preferences WHERE key = $key')
      .get({ key: exportConfigurationPreferenceKey }) as Row | undefined;
    if (!row) return undefined;
    try {
      return this.normalizeExportConfiguration(JSON.parse(String(row['value'])) as unknown);
    } catch {
      return undefined;
    }
  }

  updateExportConfiguration(
    configuration: ExportConfigurationPreference,
  ): ExportConfigurationPreference {
    const normalized = this.normalizeExportConfiguration(configuration);
    this.database
      .prepare(
        `INSERT INTO application_preferences(key, value)
         VALUES ($key, $value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({
        key: exportConfigurationPreferenceKey,
        value: JSON.stringify(normalized),
      });
    return normalized;
  }

  getSourcePriority(): SourceName[] {
    const row = this.database
      .prepare('SELECT value FROM application_preferences WHERE key = $key')
      .get({ key: sourcePriorityPreferenceKey }) as Row | undefined;
    if (!row) return [...defaultSourcePriority];
    try {
      return normalizeSourcePriority(JSON.parse(String(row['value'])) as unknown);
    } catch {
      return [...defaultSourcePriority];
    }
  }

  updateSourcePriority(sourcePriority: SourceName[]): SourceName[] {
    const normalized = normalizeSourcePriority(sourcePriority);
    if (
      normalized.length !== sourcePriority.length ||
      normalized.some((sourceName, index) => sourceName !== sourcePriority[index])
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Source priority must contain every provider exactly once.',
      });
    }
    this.database
      .prepare(
        `INSERT INTO application_preferences(key, value)
         VALUES ($key, $value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({ key: sourcePriorityPreferenceKey, value: JSON.stringify(normalized) });
    return normalized;
  }

  getExportVisibilityPresets(): ExportVisibilityPresetPreference[] | undefined {
    const row = this.database
      .prepare('SELECT value FROM application_preferences WHERE key = $key')
      .get({ key: exportVisibilityPresetsPreferenceKey }) as Row | undefined;
    if (!row) return undefined;
    try {
      const presets = JSON.parse(String(row['value'])) as ExportVisibilityPresetPreference[];
      this.validateExportVisibilityPresets(presets);
      return presets.map(({ id, name, columns }) => ({
        id,
        name,
        columns: cloneExportColumns(columns),
      }));
    } catch {
      return [];
    }
  }

  updateExportVisibilityPresets(
    presets: ExportVisibilityPresetPreference[],
  ): ExportVisibilityPresetPreference[] {
    this.validateExportVisibilityPresets(presets);
    const normalized = presets.map(({ id, name, columns }) => ({
      id,
      name,
      columns: cloneExportColumns(columns),
    }));
    this.database
      .prepare(
        `INSERT INTO application_preferences(key, value)
         VALUES ($key, $value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({
        key: exportVisibilityPresetsPreferenceKey,
        value: JSON.stringify(normalized),
      });
    return normalized;
  }

  getExportFieldNamePresets(): ExportFieldNamePresetPreference[] | undefined {
    const row = this.database
      .prepare('SELECT value FROM application_preferences WHERE key = $key')
      .get({ key: exportFieldNamePresetsPreferenceKey }) as Row | undefined;
    if (!row) return undefined;
    try {
      const presets = JSON.parse(String(row['value'])) as ExportFieldNamePresetPreference[];
      this.validateExportFieldNamePresets(presets);
      return presets.map(({ id, name, fieldNames }) => ({
        id,
        name,
        fieldNames: cloneExportFieldNames(fieldNames),
      }));
    } catch {
      return [];
    }
  }

  updateExportFieldNamePresets(
    presets: ExportFieldNamePresetPreference[],
  ): ExportFieldNamePresetPreference[] {
    this.validateExportFieldNamePresets(presets);
    const normalized = presets.map(({ id, name, fieldNames }) => ({
      id,
      name,
      fieldNames: cloneExportFieldNames(fieldNames),
    }));
    this.database
      .prepare(
        `INSERT INTO application_preferences(key, value)
         VALUES ($key, $value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run({
        key: exportFieldNamePresetsPreferenceKey,
        value: JSON.stringify(normalized),
      });
    return normalized;
  }

  private normalizeExportConfiguration(value: unknown): ExportConfigurationPreference {
    if (!isRecord(value)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Export configuration must be valid.',
      });
    }
    const dataset = value['dataset'];
    const format = value['format'];
    const columns = value['columns'];
    const fieldNames = value['fieldNames'];
    const columnShapeValid =
      isRecord(columns) &&
      ['leagues', 'teams', 'players'].every(
        (entity) =>
          Array.isArray(columns[entity]) &&
          columns[entity].every((sourceKey) => typeof sourceKey === 'string'),
      );
    const fieldNameShapeValid =
      isRecord(fieldNames) &&
      (fieldNames['nameStyle'] === 'camelCase' || fieldNames['nameStyle'] === 'snake_case') &&
      ['leagues', 'teams', 'players'].every(
        (entity) =>
          Array.isArray(fieldNames[entity]) &&
          fieldNames[entity].every(
            (mapping) =>
              isRecord(mapping) &&
              typeof mapping['sourceKey'] === 'string' &&
              typeof mapping['outputName'] === 'string',
          ),
      );
    if (
      (dataset !== 'source' && dataset !== 'combined') ||
      (format !== 'json' && format !== 'single-json' && format !== 'csv') ||
      !columnShapeValid ||
      !fieldNameShapeValid ||
      validateExportColumns(columns as unknown as ExportColumnSelection).length > 0 ||
      validateExportFieldNames(fieldNames as unknown as ExportFieldNameConfiguration).length > 0
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Export configuration must be valid.',
      });
    }
    return {
      dataset,
      format,
      columns: cloneExportColumns(columns as unknown as ExportColumnSelection),
      fieldNames: cloneExportFieldNames(fieldNames as unknown as ExportFieldNameConfiguration),
    };
  }

  private validateExportVisibilityPresets(presets: ExportVisibilityPresetPreference[]): void {
    const candidates: unknown = presets;
    if (!Array.isArray(candidates)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Visibility presets must be a collection.',
      });
    }
    for (const candidate of candidates) {
      if (!isRecord(candidate)) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Visibility presets contain invalid fields.',
        });
      }
      const columns = candidate['columns'];
      if (
        typeof candidate['id'] !== 'string' ||
        typeof candidate['name'] !== 'string' ||
        !isRecord(columns) ||
        !Array.isArray(columns['leagues']) ||
        !Array.isArray(columns['teams']) ||
        !Array.isArray(columns['players']) ||
        validateExportColumns(columns as unknown as ExportColumnSelection).length > 0
      ) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Visibility presets contain invalid fields.',
        });
      }
    }
    validateExportPresetMetadata(
      presets,
      new Set(['default', 'full']),
      new Set(['default', 'full']),
    );
  }

  private validateExportFieldNamePresets(presets: ExportFieldNamePresetPreference[]): void {
    const candidates: unknown = presets;
    if (!Array.isArray(candidates)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Field-name presets must be a collection.',
      });
    }
    for (const candidate of candidates) {
      if (!isRecord(candidate)) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Field-name presets contain invalid names.',
        });
      }
      const fieldNames = candidate['fieldNames'];
      if (
        typeof candidate['id'] !== 'string' ||
        typeof candidate['name'] !== 'string' ||
        !isRecord(fieldNames) ||
        (fieldNames['nameStyle'] !== 'camelCase' && fieldNames['nameStyle'] !== 'snake_case') ||
        !Array.isArray(fieldNames['leagues']) ||
        !Array.isArray(fieldNames['teams']) ||
        !Array.isArray(fieldNames['players']) ||
        validateExportFieldNames(fieldNames as unknown as ExportFieldNameConfiguration).length > 0
      ) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Field-name presets contain invalid names.',
        });
      }
    }
    validateExportPresetMetadata(
      presets,
      new Set(['camel-case', 'snake-case']),
      new Set(['camel case', 'snake case']),
    );
  }

  listProjects(): ProjectSummary[] {
    const databaseCount = this.fifaDatabaseCountExpression();
    const rows = this.database
      .prepare(
        `WITH project_sources AS (
           SELECT project_id, source_name FROM leagues
           UNION
           SELECT project_id, source_name FROM teams
           UNION
           SELECT project_id, source_name FROM players
         ),
         source_summaries AS (
           SELECT project_id, group_concat(source_name) AS source_names
           FROM project_sources
           GROUP BY project_id
         )
         SELECT p.*,
         COALESCE(l.league_count, 0) AS league_count,
         COALESCE(t.team_count, 0) AS team_count,
         COALESCE(pl.player_count, 0) AS player_count,
         COALESCE(cl.combined_league_count, 0) AS combined_league_count,
         COALESCE(ct.combined_team_count, 0) AS combined_team_count,
         COALESCE(cp.combined_player_count, 0) AS combined_player_count,
         ${databaseCount} AS database_count,
         COALESCE(s.source_names, '') AS source_names
         FROM projects p
         LEFT JOIN (
           SELECT project_id, count(*) AS league_count FROM leagues GROUP BY project_id
         ) l ON l.project_id = p.id
         LEFT JOIN (
           SELECT project_id, count(*) AS team_count FROM teams GROUP BY project_id
         ) t ON t.project_id = p.id
         LEFT JOIN (
           SELECT project_id, count(*) AS player_count FROM players GROUP BY project_id
         ) pl ON pl.project_id = p.id
         LEFT JOIN (
           SELECT project_id, count(*) AS combined_league_count
           FROM combined_leagues GROUP BY project_id
         ) cl ON cl.project_id = p.id
         LEFT JOIN (
           SELECT project_id, count(*) AS combined_team_count
           FROM combined_teams GROUP BY project_id
         ) ct ON ct.project_id = p.id
         LEFT JOIN (
           SELECT project_id, count(*) AS combined_player_count
           FROM combined_players GROUP BY project_id
         ) cp ON cp.project_id = p.id
         LEFT JOIN source_summaries s ON s.project_id = p.id
         ORDER BY p.reference_date DESC, p.name COLLATE NOCASE ASC`,
      )
      .all() as Row[];
    return rows.map((row) => this.toProjectSummary(row));
  }

  createProject(input: { name: string; referenceDate: string }): ProjectSummary {
    const name = input.name.trim();
    if (!name || name.length > 80 || !isReferenceDate(input.referenceDate)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Enter a project name and a valid reference date.',
      });
    }
    const now = new Date().toISOString();
    const project: ProjectSummary = {
      id: crypto.randomUUID(),
      name,
      referenceDate: input.referenceDate,
      createdAt: now,
      updatedAt: now,
      leagueCount: 0,
      teamCount: 0,
      playerCount: 0,
      combinedLeagueCount: 0,
      combinedTeamCount: 0,
      combinedPlayerCount: 0,
      sourceNames: [],
    };
    try {
      this.database
        .prepare(
          `INSERT INTO projects(id, name, reference_date, created_at, updated_at)
                VALUES ($id, $name, $referenceDate, $createdAt, $updatedAt)`,
        )
        .run({
          id: project.id,
          name: project.name,
          referenceDate: project.referenceDate,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: 'A project with this name already exists.',
        });
      }
      throw error;
    }
    return project;
  }

  renameProject(input: { projectId: string; name: string }): ProjectSummary {
    const name = input.name.trim();
    if (!name || name.length > 80) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Enter a project name using at most 80 characters.',
      });
    }
    this.getProjectSummary(input.projectId);
    try {
      this.database
        .prepare(`UPDATE projects SET name = $name, updated_at = $updatedAt WHERE id = $projectId`)
        .run({ projectId: input.projectId, name, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: 'A project with this name already exists.',
        });
      }
      throw error;
    }
    return this.getProjectSummary(input.projectId);
  }

  deleteProject(projectId: string): ProjectSummary {
    const project = this.getProjectSummary(projectId);
    this.database.prepare('DELETE FROM projects WHERE id = $projectId').run({ projectId });
    return project;
  }

  deleteAllProjects(): string[] {
    return this.transaction(() => {
      const projectIds = (
        this.database.prepare('SELECT id FROM projects ORDER BY id').all() as Row[]
      ).map((row) => String(row['id']));
      this.database.prepare('DELETE FROM projects').run();
      return projectIds;
    });
  }

  deleteLeague(request: DeleteLeagueRequest): ProjectSummary {
    return this.deleteLeagues({
      projectId: request.projectId,
      ids: [request.id],
      mode: request.mode,
    });
  }

  deleteLeagues(request: DeleteLeaguesRequest): ProjectSummary {
    if (!['league-only', 'league-and-teams'].includes(request.mode)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a valid league deletion option.',
      });
    }
    const query = this.prepareEntitySelection('leagues', request.projectId, request.ids);
    return this.transaction(() => {
      if (request.mode === 'league-and-teams') {
        this.database
          .prepare(
            `DELETE FROM teams
             WHERE project_id = $projectId AND league_id IN (${query.idFilter})`,
          )
          .run(query.parameters);
      }
      this.database
        .prepare(
          `DELETE FROM leagues
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, new Date().toISOString());
      return this.getProjectSummary(request.projectId);
    });
  }

  updateLeagueCountries(request: UpdateLeagueCountriesRequest): ProjectSummary {
    return this.updateEntityCountries('leagues', request);
  }

  updateLeagueTiers(request: UpdateLeagueTiersRequest): ProjectSummary {
    if (request.tier !== undefined && !(leagueTiers as readonly number[]).includes(request.tier)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a tier from 1 to 10 or leave it empty.',
      });
    }
    const query = this.prepareEntitySelection('leagues', request.projectId, request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.database
        .prepare(
          `UPDATE leagues SET tier = $tier, updated_at = $now
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run({ ...query.parameters, tier: request.tier ?? null, now });
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  deleteTeam(request: { projectId: string; id: string }): ProjectSummary {
    this.getEntity({ ...request, entity: 'teams' });
    return this.deleteTeams({ projectId: request.projectId, ids: [request.id] });
  }

  deleteTeams(request: DeleteTeamsRequest): ProjectSummary {
    const query = this.prepareEntitySelection('teams', request.projectId, request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.database
        .prepare(
          `DELETE FROM teams
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  updateTeamCountries(request: UpdateTeamCountriesRequest): ProjectSummary {
    return this.updateEntityCountries('teams', request);
  }

  deletePlayer(request: { projectId: string; id: string }): ProjectSummary {
    return this.deletePlayers({ projectId: request.projectId, ids: [request.id] });
  }

  deletePlayers(request: DeletePlayersRequest): ProjectSummary {
    const query = this.prepareEntitySelection('players', request.projectId, request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.database
        .prepare(
          `DELETE FROM players
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  private updateEntityCountries(
    entity: 'leagues' | 'teams',
    request: UpdateLeagueCountriesRequest | UpdateTeamCountriesRequest,
  ): ProjectSummary {
    if (request.countryCode3 !== undefined && typeof request.countryCode3 !== 'string') {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a valid country or leave it empty.',
      });
    }
    const countryCode3 = request.countryCode3?.trim() ?? '';
    const country = countryCode3 ? findFootballCountryByCode3(countryCode3) : undefined;
    if (countryCode3 && !country) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a valid country or leave it empty.',
      });
    }
    const query = this.prepareEntitySelection(entity, request.projectId, request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.database
        .prepare(
          `UPDATE ${entity}
           SET country_name = $countryName, country_code2 = $countryCode2,
               country_code3 = $countryCode3, updated_at = $now
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run({
          ...query.parameters,
          countryName: country?.name ?? null,
          countryCode2: country?.code2 ?? null,
          countryCode3: country?.code3 ?? null,
          now,
        });
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  previewSourceDataDeletion(request: DeleteSourceDataRequest): SourceDataDeletionCounts {
    const query = this.prepareSourceDataDeletion(request);
    return this.countSourceDataDeletion(query);
  }

  deleteSourceData(request: DeleteSourceDataRequest): DeleteSourceDataResult {
    const query = this.prepareSourceDataDeletion(request);

    return this.transaction(() => {
      const deleted = this.countSourceDataDeletion(query);
      this.database
        .prepare(
          `DELETE FROM players
           WHERE project_id = $projectId AND source_name IN (${query.sourceFilter})`,
        )
        .run(query.parameters);
      this.database
        .prepare(
          `DELETE FROM teams
           WHERE project_id = $projectId AND source_name IN (${query.sourceFilter})`,
        )
        .run(query.parameters);
      this.database
        .prepare(
          `DELETE FROM leagues
           WHERE project_id = $projectId AND source_name IN (${query.sourceFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, new Date().toISOString());
      return {
        project: this.getProjectSummary(request.projectId),
        deleted,
      };
    });
  }

  private prepareSourceDataDeletion(request: DeleteSourceDataRequest): {
    parameters: Record<string, string>;
    sourceFilter: string;
  } {
    if (
      !Array.isArray(request.sourceNames) ||
      request.sourceNames.length === 0 ||
      request.sourceNames.some((sourceName) => !isSourceName(sourceName))
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose at least one valid source to delete.',
      });
    }
    this.getProjectSummary(request.projectId);
    const sourceNames = [...new Set(request.sourceNames)];
    const parameters: Record<string, string> = { projectId: request.projectId };
    const placeholders = sourceNames.map((sourceName, index) => {
      const key = `sourceName${index}`;
      parameters[key] = sourceName;
      return `$${key}`;
    });
    return { parameters, sourceFilter: placeholders.join(', ') };
  }

  private prepareEntitySelection(
    entity: EntityKind,
    projectId: string,
    ids: unknown,
  ): {
    parameters: Record<string, string>;
    idFilter: string;
  } {
    const singular = entity === 'leagues' ? 'league' : entity === 'teams' ? 'team' : 'player';
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: `Choose at least one valid ${singular}.`,
      });
    }
    const entityIds = uniqueStrings(ids);
    if (!entityIds.length) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: `Choose at least one valid ${singular}.`,
      });
    }
    this.getProjectSummary(projectId);
    const parameters: Record<string, string> = { projectId };
    const placeholders = entityIds.map((id, index) => {
      const key = `${singular}Id${index}`;
      parameters[key] = id;
      return `$${key}`;
    });
    const idFilter = placeholders.join(', ');
    const selectedCount = Number(
      (
        this.database
          .prepare(
            `SELECT count(*) AS count FROM ${entity}
             WHERE project_id = $projectId AND id IN (${idFilter})`,
          )
          .get(parameters) as Row
      )['count'],
    );
    if (selectedCount !== entityIds.length) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: `One or more selected ${entity} were not found.`,
      });
    }
    return { parameters, idFilter };
  }

  private prepareCombinedEntitySelection(
    projectId: string,
    entity: CombinedEntityKind,
    ids: unknown,
  ): {
    parameters: Record<string, string>;
    idFilter: string;
  } {
    const singular = entity.slice(0, -1);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: `Choose at least one valid combined ${singular}.`,
      });
    }
    const entityIds = uniqueStrings(ids);
    if (!entityIds.length) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: `Choose at least one valid combined ${singular}.`,
      });
    }
    this.getProjectSummary(projectId);
    const parameters: Record<string, string> = { projectId };
    const placeholders = entityIds.map((id, index) => {
      const key = `combinedEntityId${index}`;
      parameters[key] = id;
      return `$${key}`;
    });
    const idFilter = placeholders.join(', ');
    const selectedCount = Number(
      (
        this.database
          .prepare(
            `SELECT count(*) AS count FROM combined_${entity}
             WHERE project_id = $projectId AND id IN (${idFilter})`,
          )
          .get(parameters) as Row
      )['count'],
    );
    if (selectedCount !== entityIds.length) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: `One or more selected combined ${entity} were not found.`,
      });
    }
    return { parameters, idFilter };
  }

  private countSourceDataDeletion(query: {
    parameters: Record<string, string>;
    sourceFilter: string;
  }): SourceDataDeletionCounts {
    const count = (statement: string): number =>
      Number((this.database.prepare(statement).get(query.parameters) as Row)['count']);
    return {
      leagues: count(
        `SELECT count(*) AS count FROM leagues
         WHERE project_id = $projectId AND source_name IN (${query.sourceFilter})`,
      ),
      teams: count(
        `SELECT count(*) AS count FROM teams
         WHERE project_id = $projectId AND source_name IN (${query.sourceFilter})`,
      ),
      players: count(
        `SELECT count(*) AS count FROM players
         WHERE project_id = $projectId
         AND (
           source_name IN (${query.sourceFilter})
           OR team_id IN (
             SELECT id FROM teams
             WHERE project_id = $projectId AND source_name IN (${query.sourceFilter})
           )
         )`,
      ),
    };
  }

  getProjectSummary(projectId: string): ProjectSummary {
    const databaseCount = this.fifaDatabaseCountExpression();
    const row = this.database
      .prepare(
        `SELECT p.*,
        (SELECT count(*) FROM leagues WHERE project_id = p.id) AS league_count,
        (SELECT count(*) FROM teams WHERE project_id = p.id) AS team_count,
        (SELECT count(*) FROM players WHERE project_id = p.id) AS player_count,
        (SELECT count(*) FROM combined_leagues WHERE project_id = p.id) AS combined_league_count,
        (SELECT count(*) FROM combined_teams WHERE project_id = p.id) AS combined_team_count,
        (SELECT count(*) FROM combined_players WHERE project_id = p.id) AS combined_player_count,
        ${databaseCount} AS database_count,
        COALESCE(
          (
            SELECT group_concat(source_name)
            FROM (
              SELECT source_name FROM leagues WHERE project_id = p.id
              UNION
              SELECT source_name FROM teams WHERE project_id = p.id
              UNION
              SELECT source_name FROM players WHERE project_id = p.id
            )
          ),
          ''
        ) AS source_names
        FROM projects p WHERE p.id = $projectId`,
      )
      .get({ projectId }) as Row | null;
    if (!row) throw new ApplicationError({ code: 'NOT_FOUND', message: 'Project was not found.' });
    return this.toProjectSummary(row);
  }

  getEntity(request: {
    projectId: string;
    entity: EditableEntityKind;
    id: string;
  }): EditableEntity {
    this.getProjectSummary(request.projectId);
    const row =
      request.entity === 'leagues'
        ? (this.database
            .prepare(
              `SELECT leagues.*,
               (SELECT count(*) FROM teams WHERE teams.league_id = leagues.id) AS team_count,
               (SELECT count(*) FROM players
                JOIN teams ON teams.id = players.team_id
                WHERE teams.league_id = leagues.id) AS player_count
               FROM leagues WHERE leagues.project_id = $projectId AND leagues.id = $id`,
            )
            .get({ projectId: request.projectId, id: request.id }) as Row | null)
        : (this.database
            .prepare(
              `SELECT teams.*,
               (SELECT count(*) FROM players WHERE players.team_id = teams.id) AS player_count
               FROM teams WHERE teams.project_id = $projectId AND teams.id = $id`,
            )
            .get({ projectId: request.projectId, id: request.id }) as Row | null);
    if (!row) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: `${request.entity === 'leagues' ? 'League' : 'Team'} was not found.`,
      });
    }
    const entity = request.entity === 'leagues' ? this.toLeague(row) : this.toTeam(row);
    return this.attachCustomBadges(request.entity, [entity])[0];
  }

  updateEntityMetadata(request: UpdateEntityMetadataRequest): EditableEntity {
    const name = request.name.trim();
    const current = this.getEntity(request);
    const sourceId = parseSourceIdentifier(
      current.sourceName,
      request.sourceId,
      request.entity === 'leagues' ? 'league' : 'team',
    );
    const season = sourceSupportsSeason[current.sourceName] ? (request.season?.trim() ?? '') : '';
    const country = request.countryCode3
      ? findFootballCountryByCode3(request.countryCode3)
      : undefined;
    if (
      request.entity === 'leagues' &&
      request.tier !== undefined &&
      !(leagueTiers as readonly number[]).includes(request.tier)
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a tier from 1 to 10 or leave it empty.',
      });
    }
    if (!name || (season && !/^\d{4}$/.test(season))) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Enter a name, a valid Source ID, and an optional four-digit season.',
      });
    }
    if (request.countryCode3 && !country) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose a valid country or leave it empty.',
      });
    }
    if (request.entity === 'teams' && request.leagueId) {
      const league = this.getEntity({
        projectId: request.projectId,
        entity: 'leagues',
        id: request.leagueId,
      });
      if (league.sourceName !== current.sourceName) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'A team can only belong to a league from the same provider.',
        });
      }
    }
    try {
      return this.transaction(() => {
        const now = new Date().toISOString();
        if (request.entity === 'leagues') {
          this.database
            .prepare(
              `UPDATE leagues SET name = $name, country_name = $countryName,
               country_code2 = $countryCode2, country_code3 = $countryCode3,
               source_id = $sourceId, season = $season, tier = $tier, updated_at = $now
               WHERE project_id = $projectId AND id = $id`,
            )
            .run({
              projectId: request.projectId,
              id: request.id,
              name,
              countryName: country?.name ?? null,
              countryCode2: country?.code2 ?? null,
              countryCode3: country?.code3 ?? null,
              sourceId,
              season,
              tier: request.tier ?? null,
              now,
            });
        } else {
          this.database
            .prepare(
              `UPDATE teams SET name = $name, country_name = $countryName,
               country_code2 = $countryCode2, country_code3 = $countryCode3,
               source_id = $sourceId, season = $season, league_id = $leagueId, updated_at = $now
               WHERE project_id = $projectId AND id = $id`,
            )
            .run({
              projectId: request.projectId,
              id: request.id,
              name,
              countryName: country?.name ?? null,
              countryCode2: country?.code2 ?? null,
              countryCode3: country?.code3 ?? null,
              sourceId,
              season,
              leagueId: request.leagueId ?? null,
              now,
            });
        }
        this.touchProject(request.projectId, now);
        return this.getEntity(request);
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: `A ${request.entity === 'leagues' ? 'league' : 'team'} with this Source ID and season already exists.`,
        });
      }
      throw error;
    }
  }

  listEntities(request: PageRequest): Page<Entity> {
    if (!['leagues', 'teams', 'players'].includes(request.entity)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The requested table is invalid.',
      });
    }
    const project = this.getProjectSummary(request.projectId);
    const pageSize = Math.min(Math.max(request.pageSize, 1), 200);
    const pageIndex = Math.max(request.pageIndex, 0);
    const offset = pageIndex * pageSize;
    const table = request.entity;
    const where = ['project_id = $projectId'];
    const values: Record<string, string | number | null> = { projectId: request.projectId };
    const addInFilter = (
      column: string,
      parameterPrefix: string,
      selectedValues: readonly string[],
    ): void => {
      if (!selectedValues.length) return;
      const parameters = selectedValues.map((value, index) => {
        const key = `${parameterPrefix}${index}`;
        values[key] = value;
        return `$${key}`;
      });
      where.push(`${column} IN (${parameters.join(', ')})`);
    };
    const search = request.search.trim();
    if (search) {
      where.push(
        table === 'leagues' || table === 'teams'
          ? "(name LIKE $search ESCAPE '\\' OR source_id LIKE $search ESCAPE '\\' OR country_name LIKE $search ESCAPE '\\')"
          : "(name LIKE $search ESCAPE '\\' OR source_id LIKE $search ESCAPE '\\')",
      );
      values['search'] =
        `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    }
    addInFilter(
      'source_name',
      'sourceName',
      uniqueStrings(request.sourceNames ?? []).filter((sourceName): sourceName is SourceName =>
        isSourceName(sourceName),
      ),
    );
    const statuses = uniqueStrings(request.statuses ?? [])
      .map(normalizeEntityStatus)
      .filter((status) => status !== undefined);
    const badgeFilters: string[] = [];
    if (statuses.length) {
      const requestedAsOf = request.statusAsOf ? new Date(request.statusAsOf) : new Date();
      const thresholds =
        createEntityStatusThresholds(
          project.referenceDate,
          requestedAsOf,
          request.statusSettings,
        ) ??
        createEntityStatusThresholds(project.referenceDate, new Date(), request.statusSettings);
      if (!thresholds) {
        badgeFilters.push('0 = 1');
      } else {
        values['statusAsOf'] = thresholds.asOfIso;
        if (statuses.includes('new')) {
          values['newCutoff'] = thresholds.newCutoffIso;
          badgeFilters.push('(created_at >= $newCutoff AND created_at <= $statusAsOf)');
        }
        if (statuses.includes('old') && thresholds.oldCutoffDate) {
          values['oldCutoff'] = thresholds.oldCutoffDate;
          badgeFilters.push('(date(updated_at) <= $oldCutoff AND updated_at <= $statusAsOf)');
        }
      }
    }
    const requestedCustomBadgeIds = uniqueStrings(request.customBadgeIds ?? []);
    const availableCustomBadgeIds = requestedCustomBadgeIds.length
      ? new Set(this.listCustomBadges().map(({ id }) => id))
      : new Set<string>();
    const customBadgeIds = requestedCustomBadgeIds.filter((id) => availableCustomBadgeIds.has(id));
    if (customBadgeIds.length) {
      const parameters = customBadgeIds.map((id, index) => {
        const key = `customBadgeId${index}`;
        values[key] = id;
        return `$${key}`;
      });
      const assignment = customBadgeAssignmentTables[table];
      badgeFilters.push(
        `EXISTS (
           SELECT 1 FROM ${assignment.table} custom_badge_assignment
           WHERE custom_badge_assignment.${assignment.entityIdColumn} = ${table}.id
             AND custom_badge_assignment.badge_id IN (${parameters.join(', ')})
         )`,
      );
    }
    if (badgeFilters.length) where.push(`(${badgeFilters.join(' OR ')})`);
    addInFilter('season', 'season', uniqueStrings(request.seasons ?? []));
    if (table === 'leagues' || table === 'teams') {
      addInFilter('country_name COLLATE NOCASE', 'country', uniqueStrings(request.countries ?? []));
    }
    const tiers = [
      ...new Set(
        (request.tiers ?? []).filter(
          (tier): tier is number =>
            typeof tier === 'number' &&
            Number.isInteger(tier) &&
            (leagueTiers as readonly number[]).includes(tier),
        ),
      ),
    ];
    if (table === 'leagues' && (tiers.length || request.includeLeaguesWithoutTier)) {
      const tierFilters: string[] = [];
      if (tiers.length) {
        const parameters = tiers.map((tier, index) => {
          const key = `tier${index}`;
          values[key] = tier;
          return `$${key}`;
        });
        tierFilters.push(`tier IN (${parameters.join(', ')})`);
      }
      if (request.includeLeaguesWithoutTier) tierFilters.push('tier IS NULL');
      where.push(`(${tierFilters.join(' OR ')})`);
    }
    const leagueIds = [
      ...new Set(
        [...(request.leagueIds ?? []), request.leagueId ?? '']
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    if (table === 'teams' && (leagueIds.length || request.includeTeamsWithoutLeague)) {
      const leagueFilters: string[] = [];
      if (leagueIds.length) {
        const parameters = leagueIds.map((leagueId, index) => {
          const key = `leagueId${index}`;
          values[key] = leagueId;
          return `$${key}`;
        });
        leagueFilters.push(`league_id IN (${parameters.join(', ')})`);
      }
      if (request.includeTeamsWithoutLeague) leagueFilters.push('league_id IS NULL');
      where.push(`(${leagueFilters.join(' OR ')})`);
    }
    const teamIds = [
      ...new Set(
        [...(request.teamIds ?? []), request.teamId ?? ''].map((id) => id.trim()).filter(Boolean),
      ),
    ];
    if (table === 'players' && teamIds.length) {
      const parameters = teamIds.map((teamId, index) => {
        const key = `teamId${index}`;
        values[key] = teamId;
        return `$${key}`;
      });
      where.push(`team_id IN (${parameters.join(', ')})`);
    }
    if (table === 'players') {
      addInFilter(
        'country_name COLLATE NOCASE',
        'nationality',
        uniqueStrings(request.nationalities ?? []),
      );
      addInFilter(
        'position',
        'position',
        uniqueStrings(request.positions ?? []).filter((position) =>
          playerPositions.includes(position as (typeof playerPositions)[number]),
        ),
      );
      addInFilter(
        'position_detail',
        'positionDetail',
        uniqueStrings(request.positionDetails ?? []).filter((positionDetail) =>
          playerPositionDetails.includes(positionDetail as (typeof playerPositionDetails)[number]),
        ),
      );
      addInFilter(
        'foot',
        'foot',
        uniqueStrings(request.feet ?? []).filter((foot) =>
          playerFeet.includes(foot as (typeof playerFeet)[number]),
        ),
      );
    }
    const clause = where.join(' AND ');
    const total = Number(
      (
        this.database
          .prepare(`SELECT count(*) AS total FROM ${table} WHERE ${clause}`)
          .get(values) as Row
      )['total'],
    );
    const columns = entitySortColumns[table] as Record<string, string>;
    const sort = columns[request.sort] ?? columns['name'];
    const direction = request.direction === 'desc' ? 'DESC' : 'ASC';
    const select =
      table === 'leagues'
        ? `SELECT leagues.*,
           (SELECT count(*) FROM teams WHERE teams.league_id = leagues.id) AS team_count,
           (SELECT count(*) FROM players
            JOIN teams ON teams.id = players.team_id
            WHERE teams.league_id = leagues.id) AS player_count
           FROM leagues`
        : table === 'teams'
          ? `SELECT teams.*,
             (SELECT count(*) FROM players WHERE players.team_id = teams.id) AS player_count,
             (SELECT name FROM leagues WHERE leagues.id = teams.league_id) AS league_name
             FROM teams`
          : `SELECT players.*,
             (SELECT name FROM teams WHERE teams.id = players.team_id) AS team_name,
             (SELECT leagues.name
              FROM teams
              JOIN leagues ON leagues.id = teams.league_id
              WHERE teams.id = players.team_id) AS league_name
             FROM players`;
    const rows = this.database
      .prepare(
        `${select} WHERE ${clause}
         ORDER BY ${sort} ${direction}, name COLLATE NOCASE ASC, id ASC LIMIT $pageSize OFFSET $offset`,
      )
      .all({ ...values, pageSize, offset }) as Row[];
    const mapped = rows.map((row) => {
      if (table === 'leagues') return this.toLeague(row);
      if (table === 'teams') return this.toTeam(row);
      return this.toPlayer(row);
    });
    return {
      rows: this.attachCustomBadges(table, mapped),
      total,
      pageIndex,
      pageSize,
    };
  }

  listEntityFilterOptions(request: EntityFilterOptionsRequest): EntityFilterOptions {
    if (!['leagues', 'teams', 'players'].includes(request.entity)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The requested table is invalid.',
      });
    }
    this.getProjectSummary(request.projectId);
    if (request.entity === 'leagues') {
      const tiers = (
        this.database
          .prepare(
            `SELECT DISTINCT tier FROM leagues
             WHERE project_id = $projectId AND tier IS NOT NULL ORDER BY tier ASC`,
          )
          .all({ projectId: request.projectId }) as Row[]
      ).map((row) => Number(row['tier']));
      const withoutTier = this.database
        .prepare(
          `SELECT EXISTS(
             SELECT 1 FROM leagues WHERE project_id = $projectId AND tier IS NULL
           ) AS present`,
        )
        .get({ projectId: request.projectId }) as Row;
      return {
        entity: 'leagues',
        customBadges: this.listCustomBadges(),
        sourceNames: this.listSourceNames('leagues', request.projectId),
        countries: this.listCountryOptions('leagues', request.projectId),
        seasons: this.listDistinctText('leagues', 'season', request.projectId),
        tiers,
        hasLeaguesWithoutTier: Boolean(withoutTier['present']),
      };
    }
    if (request.entity === 'teams') {
      const leagues = this.database
        .prepare(
          `SELECT id, source_name, source_id, name, country_name, country_code2, country_code3, tier
           FROM leagues WHERE project_id = $projectId
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
        )
        .all({ projectId: request.projectId }) as Row[];
      const withoutLeague = this.database
        .prepare(
          `SELECT EXISTS(
             SELECT 1 FROM teams WHERE project_id = $projectId AND league_id IS NULL
           ) AS present`,
        )
        .get({ projectId: request.projectId }) as Row;
      return {
        entity: 'teams',
        customBadges: this.listCustomBadges(),
        sourceNames: this.listSourceNames('teams', request.projectId),
        leagues: leagues.map((row) => {
          const countryCode2 = optionalString(row['country_code2']);
          const countryCode3 = optionalString(row['country_code3']);
          return {
            id: String(row['id']),
            sourceName: String(row['source_name']) as SourceName,
            sourceId: String(row['source_id']),
            name: String(row['name']),
            countryName: optionalString(row['country_name']),
            countryCode: countryCode3
              ? (findFootballCountryByCode3(countryCode3)?.flagCode ?? countryCode2)
              : countryCode2,
            tier: optionalNumber(row['tier']),
          };
        }),
        hasTeamsWithoutLeague: Boolean(withoutLeague['present']),
        countries: this.listCountryOptions('teams', request.projectId),
        seasons: this.listDistinctText('teams', 'season', request.projectId),
      };
    }
    const teams = this.database
      .prepare(
        `SELECT id, source_name, source_id, name FROM teams WHERE project_id = $projectId
         ORDER BY name COLLATE NOCASE ASC, id ASC`,
      )
      .all({ projectId: request.projectId }) as Row[];
    const presentPositions = new Set(
      this.listDistinctText('players', 'position', request.projectId),
    );
    const presentPositionDetails = new Set(
      this.listDistinctText('players', 'position_detail', request.projectId),
    );
    const presentFeet = new Set(this.listDistinctText('players', 'foot', request.projectId));
    return {
      entity: 'players',
      customBadges: this.listCustomBadges(),
      sourceNames: this.listSourceNames('players', request.projectId),
      teams: teams.map((row) => ({
        id: String(row['id']),
        sourceName: String(row['source_name']) as SourceName,
        sourceId: String(row['source_id']),
        name: String(row['name']),
      })),
      nationalities: this.listNationalityOptions(request.projectId),
      positions: playerPositions.filter((position) => presentPositions.has(position)),
      positionDetails: playerPositionDetails.filter((positionDetail) =>
        presentPositionDetails.has(positionDetail),
      ),
      feet: playerFeet.filter((foot) => presentFeet.has(foot)),
    };
  }

  previewImportChanges(request: CommitImportRequest): ImportPreview {
    this.getProjectSummary(request.projectId);
    this.validateImportRequest(request);
    return {
      changes: this.calculateImportChanges(request),
      conflicts: this.calculateImportConflicts(request),
    };
  }

  commitImport(request: CommitImportRequest): ImportResult {
    this.getProjectSummary(request.projectId);
    this.validateImportRequest(request);
    return this.transaction(() => {
      const now = new Date().toISOString();
      const changes = this.calculateImportChanges(request);
      if (request.operation.kind === 'merge') this.mergeImport(request, now);
      else this.synchronizeImport(request, now);
      this.touchProject(request.projectId, now);
      return {
        leagueCount: request.league ? 1 : 0,
        teamCount: request.teams.length,
        playerCount: request.teams.reduce((total, team) => total + team.players.length, 0),
        changes,
      };
    });
  }

  private validateImportRequest(request: CommitImportRequest): void {
    if (!isSourceName(request.sourceName)) {
      throw new ApplicationError({ code: 'INVALID_INPUT', message: 'Choose a valid source.' });
    }
    if (
      !sourceSupportsSeason[request.sourceName] &&
      (request.league?.season || request.teams.some((team) => Boolean(team.season)))
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: `${sourceLabels[request.sourceName]} imports do not support seasons.`,
      });
    }
    if (request.operation.kind === 'merge') {
      const options: unknown = request.operation.options;
      if (!request.teams.length) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Select at least one team to import.',
        });
      }
      if (
        !isRecord(options) ||
        !['keep', 'refresh'].includes(String(options['existingRecords'])) ||
        !['keep', 'move'].includes(String(options['teamLeagueConflicts'])) ||
        !['keep', 'move'].includes(String(options['playerTeamConflicts']))
      ) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'The import conflict behavior is invalid.',
        });
      }
    } else {
      const operation = request.operation;
      const target = this.getEntity({ projectId: request.projectId, ...operation.target });
      const options: unknown = operation.options;
      if (isLeagueSynchronization(operation)) {
        if (
          !isRecord(options) ||
          !['keep', 'detach', 'delete'].includes(String(options['absentTeams'])) ||
          !['keep', 'delete'].includes(String(options['absentPlayers'])) ||
          typeof options['overrideTeamNames'] !== 'boolean' ||
          typeof options['overridePlayerNames'] !== 'boolean' ||
          !['keep', 'move'].includes(String(options['teamLeagueConflicts'])) ||
          !['keep', 'move'].includes(String(options['playerTeamConflicts']))
        ) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'The league update behavior is invalid.',
          });
        }
        if (!request.league) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'The synchronized league payload is invalid.',
          });
        }
        this.assertIdentityMatches(
          target,
          request.sourceName,
          request.league.sourceId,
          request.league.season,
        );
      } else {
        if (
          !isRecord(options) ||
          !['keep', 'delete'].includes(String(options['absentPlayers'])) ||
          typeof options['overridePlayerNames'] !== 'boolean' ||
          !['keep', 'move'].includes(String(options['playerTeamConflicts']))
        ) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'The team update behavior is invalid.',
          });
        }
        if (request.league || request.teams.length !== 1) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'A synchronized team update must contain exactly one team.',
          });
        }
        const team = request.teams[0];
        this.assertIdentityMatches(target, request.sourceName, team.sourceId, team.season);
      }
    }
    const teamKeys = new Set<string>();
    const stablePlayerKeys = new Set<string>();
    for (const team of request.teams) {
      const key = teamIdentity(team.sourceId, team.season);
      if (teamKeys.has(key)) {
        throw new ApplicationError({ code: 'INVALID_INPUT', message: 'Duplicate team selected.' });
      }
      teamKeys.add(key);
      const playerKeys = new Set<string>();
      for (const player of team.players) {
        const playerKey = playerIdentity(player);
        if (playerKeys.has(playerKey)) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'Duplicate player selected.',
          });
        }
        playerKeys.add(playerKey);
        if (isStablePlayerIdentity(player)) {
          if (stablePlayerKeys.has(player.sourceId)) {
            throw new ApplicationError({
              code: 'INVALID_INPUT',
              message: `The same ${sourceLabels[request.sourceName]} player is selected for multiple teams. Deselect one occurrence.`,
            });
          }
          stablePlayerKeys.add(player.sourceId);
        }
      }
    }
  }

  private assertIdentityMatches(
    target: EditableEntity,
    sourceName: SourceName,
    sourceId: string,
    season: string | undefined,
  ): void {
    if (
      target.sourceName !== sourceName ||
      teamIdentity(target.sourceId, target.season) !== teamIdentity(sourceId, season)
    ) {
      throw new ApplicationError({
        code: 'CONFLICT',
        message: 'The selected record changed. Reload it before synchronizing.',
      });
    }
  }

  private calculateImportChanges(request: CommitImportRequest): ImportChangeSummary {
    const changes = emptyChanges();
    if (request.operation.kind === 'merge') {
      const refresh = request.operation.options.existingRecords === 'refresh';
      if (request.league) {
        const existingLeague = this.findEntityByIdentity(
          'leagues',
          request.projectId,
          request.sourceName,
          request.league.sourceId,
          request.league.season,
        );
        changes.leagues[existingLeague ? (refresh ? 'updated' : 'preserved') : 'added'] += 1;
      }
      const incomingLeague = request.league
        ? this.findEntityByIdentity(
            'leagues',
            request.projectId,
            request.sourceName,
            request.league.sourceId,
            request.league.season,
          )
        : undefined;
      for (const team of request.teams) {
        const existingTeam = this.findEntityByIdentity(
          'teams',
          request.projectId,
          request.sourceName,
          team.sourceId,
          team.season,
        );
        changes.teams[existingTeam ? (refresh ? 'updated' : 'preserved') : 'added'] += 1;
        if (
          request.league &&
          existingTeam?.['league_id'] &&
          existingTeam['league_id'] !== incomingLeague?.['id'] &&
          request.operation.options.teamLeagueConflicts === 'move'
        ) {
          changes.teams.moved += 1;
        }
        this.calculatePlayerChanges(
          changes,
          request.projectId,
          request.sourceName,
          existingTeam,
          team.players,
          'keep',
          refresh,
          request.operation.options.playerTeamConflicts,
        );
      }
      return changes;
    }

    const operation = request.operation;
    const { entity, id } = operation.target;
    if (entity === 'teams') {
      changes.teams.updated = 1;
      const targetRow = this.getEntityRow('teams', request.projectId, id);
      this.calculatePlayerChanges(
        changes,
        request.projectId,
        request.sourceName,
        targetRow,
        request.teams[0]?.players ?? [],
        operation.options.absentPlayers,
        true,
        operation.options.playerTeamConflicts,
      );
      return changes;
    }

    if (!isLeagueSynchronization(operation)) return changes;
    changes.leagues.updated = 1;
    const existingTargetTeams = this.getTeamRowsForLeague(
      request.projectId,
      id,
      request.sourceName,
    );
    const selectedTeamKeys = new Set(
      request.teams.map((team) => teamIdentity(team.sourceId, team.season)),
    );
    for (const team of request.teams) {
      const existingTeam = this.findEntityByIdentity(
        'teams',
        request.projectId,
        request.sourceName,
        team.sourceId,
        team.season,
      );
      changes.teams[existingTeam ? 'updated' : 'added'] += 1;
      if (
        existingTeam?.['league_id'] &&
        existingTeam['league_id'] !== id &&
        operation.options.teamLeagueConflicts === 'move'
      ) {
        changes.teams.moved += 1;
      }
      this.calculatePlayerChanges(
        changes,
        request.projectId,
        request.sourceName,
        existingTeam,
        team.players,
        operation.options.absentPlayers,
        true,
        operation.options.playerTeamConflicts,
      );
    }
    for (const teamRow of existingTargetTeams) {
      const key = teamIdentity(String(teamRow['source_id']), optionalString(teamRow['season']));
      if (selectedTeamKeys.has(key)) continue;
      if (operation.options.absentTeams === 'delete') {
        changes.teams.deleted += 1;
        changes.players.deleted += this.getPlayerRows(String(teamRow['id'])).length;
      } else if (operation.options.absentTeams === 'detach') {
        changes.teams.detached += 1;
      }
    }
    return changes;
  }

  private calculatePlayerChanges(
    changes: ImportChangeSummary,
    projectId: string,
    sourceName: SourceName,
    existingTeam: Row | undefined,
    players: PlayerInput[],
    absentPlayers: 'keep' | 'delete',
    refreshExisting: boolean,
    ownershipPolicy: 'keep' | 'move',
  ): void {
    const existingPlayers = existingTeam
      ? this.getPlayerRows(String(existingTeam['id']), sourceName)
      : ([] as Row[]);
    const selectedKeys = new Set<string>();
    for (const player of players) {
      const key = playerIdentity(player);
      selectedKeys.add(key);
      const rows = this.getPlayerRowsByIdentity(projectId, sourceName, existingTeam, player);
      if (!rows.length) {
        changes.players.added += 1;
        continue;
      }
      const canonical = rows[0];
      const isDifferentTeam = canonical['team_id'] !== existingTeam?.['id'];
      const forcedMove = rows.length > 1;
      if (isDifferentTeam && ownershipPolicy === 'keep' && !forcedMove) {
        changes.players.preserved += 1;
        continue;
      }
      changes.players[refreshExisting ? 'updated' : 'preserved'] += 1;
      if (isDifferentTeam && (ownershipPolicy === 'move' || forcedMove)) {
        changes.players.moved += 1;
      }
      changes.players.deduplicated += Math.max(0, rows.length - 1);
    }
    if (absentPlayers === 'delete') {
      changes.players.deleted += existingPlayers.filter(
        (row) => !selectedKeys.has(String(row['source_id'])),
      ).length;
    }
  }

  private calculateImportConflicts(request: CommitImportRequest): ImportConflictSummary {
    const conflicts = emptyConflicts();
    const incomingLeague = request.league
      ? this.findEntityByIdentity(
          'leagues',
          request.projectId,
          request.sourceName,
          request.league.sourceId,
          request.league.season,
        )
      : undefined;
    if (request.league && incomingLeague) {
      conflicts.existingRecords.push({
        entity: 'leagues',
        sourceName: request.sourceName,
        sourceId: request.league.sourceId,
        ...(request.league.season && { season: request.league.season }),
        storedName: String(incomingLeague['name']),
        incomingName: request.league.name,
      });
    }
    for (const team of request.teams) {
      const existingTeam = this.findEntityByIdentity(
        'teams',
        request.projectId,
        request.sourceName,
        team.sourceId,
        team.season,
      );
      if (existingTeam) {
        conflicts.existingRecords.push({
          entity: 'teams',
          sourceName: request.sourceName,
          sourceId: team.sourceId,
          ...(team.season && { season: team.season }),
          storedName: String(existingTeam['name']),
          incomingName: team.name,
        });
      }
      if (
        request.league &&
        existingTeam?.['league_id'] &&
        existingTeam['league_id'] !== incomingLeague?.['id']
      ) {
        conflicts.teamLeagueConflicts.push({
          entity: 'teams',
          sourceName: request.sourceName,
          sourceId: team.sourceId,
          name: team.name,
          currentParents: [this.getLeagueName(String(existingTeam['league_id']))],
          incomingParent: request.league.name,
          legacyCopyCount: 1,
        });
      }
      for (const player of team.players) {
        const rows = this.getPlayerRowsByIdentity(
          request.projectId,
          request.sourceName,
          existingTeam,
          player,
        );
        if (!rows.length) continue;
        const canonical = rows[0];
        conflicts.existingRecords.push({
          entity: 'players',
          sourceName: request.sourceName,
          sourceId: playerIdentity(player),
          storedName: String(canonical['name']),
          incomingName: player.name,
        });
        const currentTeamIds = uniqueStrings(rows.map((row) => String(row['team_id'])));
        const differentTeam =
          !existingTeam || currentTeamIds.some((id) => id !== existingTeam['id']);
        if (differentTeam) {
          conflicts.playerTeamConflicts.push({
            entity: 'players',
            sourceName: request.sourceName,
            sourceId: playerIdentity(player),
            name: player.name,
            currentParents: currentTeamIds.map((id) => this.getTeamName(id)),
            incomingParent: team.name,
            legacyCopyCount: rows.length,
          });
        }
      }
    }
    return conflicts;
  }

  private mergeImport(request: CommitImportRequest, now: string): void {
    if (request.operation.kind !== 'merge') return;
    const refresh = request.operation.options.existingRecords === 'refresh';
    let leagueId: string | undefined;
    if (request.league) {
      leagueId = this.upsertLeague(
        request.projectId,
        request.sourceName,
        request.league,
        now,
        refresh,
      );
    }
    for (const team of request.teams) {
      const existingTeam = this.findEntityByIdentity(
        'teams',
        request.projectId,
        request.sourceName,
        team.sourceId,
        team.season,
      );
      const hasLeagueConflict = Boolean(
        leagueId && existingTeam?.['league_id'] && existingTeam['league_id'] !== leagueId,
      );
      const applyLeague = Boolean(
        leagueId &&
        (!existingTeam ||
          (!existingTeam['league_id'] && existingTeam['league_id'] !== leagueId) ||
          (hasLeagueConflict && request.operation.options.teamLeagueConflicts === 'move')),
      );
      const teamId = this.upsertTeam(
        request.projectId,
        request.sourceName,
        leagueId,
        team,
        now,
        refresh,
        refresh,
        applyLeague,
      );
      for (const player of team.players) {
        this.importPlayer(
          request.projectId,
          request.sourceName,
          teamId,
          player,
          now,
          refresh,
          true,
          request.operation.options.playerTeamConflicts,
        );
      }
    }
  }

  private synchronizeImport(request: CommitImportRequest, now: string): void {
    if (request.operation.kind !== 'synchronize') return;
    const operation = request.operation;
    const { entity, id } = operation.target;
    if (entity === 'teams') {
      const team = request.teams[0];
      this.updateTeamFromImport(request.projectId, id, team, now);
      this.synchronizePlayers(
        request.projectId,
        request.sourceName,
        id,
        team.players,
        now,
        operation.options.absentPlayers,
        operation.options.overridePlayerNames,
        operation.options.playerTeamConflicts,
      );
      return;
    }

    if (!isLeagueSynchronization(operation)) return;
    const league = request.league;
    if (!league) return;
    this.updateLeagueFromImport(request.projectId, id, league, now);
    const selectedTeamKeys = new Set(
      request.teams.map((team) => teamIdentity(team.sourceId, team.season)),
    );
    const existingTargetTeams = this.getTeamRowsForLeague(
      request.projectId,
      id,
      request.sourceName,
    );
    for (const team of request.teams) {
      const existingTeam = this.findEntityByIdentity(
        'teams',
        request.projectId,
        request.sourceName,
        team.sourceId,
        team.season,
      );
      const hasLeagueConflict = Boolean(
        existingTeam?.['league_id'] && existingTeam['league_id'] !== id,
      );
      const teamId = this.upsertTeam(
        request.projectId,
        request.sourceName,
        id,
        team,
        now,
        operation.options.overrideTeamNames,
        true,
        !hasLeagueConflict || operation.options.teamLeagueConflicts === 'move',
      );
      this.synchronizePlayers(
        request.projectId,
        request.sourceName,
        teamId,
        team.players,
        now,
        operation.options.absentPlayers,
        operation.options.overridePlayerNames,
        operation.options.playerTeamConflicts,
      );
    }
    for (const teamRow of existingTargetTeams) {
      const key = teamIdentity(String(teamRow['source_id']), optionalString(teamRow['season']));
      if (selectedTeamKeys.has(key)) continue;
      if (operation.options.absentTeams === 'delete') {
        this.database.prepare('DELETE FROM teams WHERE id = $id').run({ id: teamRow['id'] });
      } else if (operation.options.absentTeams === 'detach') {
        this.database
          .prepare(
            `UPDATE teams SET league_id = NULL, updated_at = $now
             WHERE project_id = $projectId AND league_id = $leagueId AND id = $id`,
          )
          .run({ projectId: request.projectId, leagueId: id, id: teamRow['id'], now });
      }
    }
  }

  private synchronizePlayers(
    projectId: string,
    sourceName: SourceName,
    teamId: string,
    players: PlayerInput[],
    now: string,
    absentPlayers: 'keep' | 'delete',
    overridePlayerNames: boolean,
    ownershipPolicy: 'keep' | 'move',
  ): void {
    const selectedKeys = new Set(players.map(playerIdentity));
    for (const player of players) {
      this.importPlayer(
        projectId,
        sourceName,
        teamId,
        player,
        now,
        true,
        overridePlayerNames,
        ownershipPolicy,
      );
    }
    if (absentPlayers === 'keep') return;
    for (const row of this.getPlayerRows(teamId, sourceName)) {
      if (!selectedKeys.has(String(row['source_id']))) {
        this.database.prepare('DELETE FROM players WHERE id = $id').run({ id: row['id'] });
      }
    }
  }

  private updateLeagueFromImport(
    projectId: string,
    id: string,
    _league: NonNullable<CommitImportRequest['league']>,
    now: string,
  ): void {
    this.database
      .prepare('UPDATE leagues SET updated_at = $now WHERE project_id = $projectId AND id = $id')
      .run({ projectId, id, now });
  }

  private updateTeamFromImport(
    projectId: string,
    id: string,
    _team: ImportTeam,
    now: string,
  ): void {
    this.database
      .prepare('UPDATE teams SET updated_at = $now WHERE project_id = $projectId AND id = $id')
      .run({ projectId, id, now });
  }

  private findEntityByIdentity(
    entity: EditableEntityKind,
    projectId: string,
    sourceName: SourceName,
    sourceId: string,
    season: string | undefined,
  ): Row | undefined {
    return this.database
      .prepare(
        `SELECT * FROM ${entity} WHERE project_id = $projectId AND source_name = $sourceName
         AND source_id = $sourceId AND season = $season`,
      )
      .get({ projectId, sourceName, sourceId, season: season ?? '' }) as Row | undefined;
  }

  private getEntityRow(entity: EditableEntityKind, projectId: string, id: string): Row {
    const row = this.database
      .prepare(`SELECT * FROM ${entity} WHERE project_id = $projectId AND id = $id`)
      .get({ projectId, id }) as Row | undefined;
    if (!row) throw new ApplicationError({ code: 'NOT_FOUND', message: 'Record was not found.' });
    return row;
  }

  private getTeamRowsForLeague(
    projectId: string,
    leagueId: string,
    sourceName?: SourceName,
  ): Row[] {
    return this.database
      .prepare(
        `SELECT * FROM teams WHERE project_id = $projectId AND league_id = $leagueId
         AND ($sourceName IS NULL OR source_name = $sourceName)`,
      )
      .all({ projectId, leagueId, sourceName: sourceName ?? null }) as Row[];
  }

  private getPlayerRows(teamId: string, sourceName?: SourceName): Row[] {
    return this.database
      .prepare(
        `SELECT * FROM players WHERE team_id = $teamId
         AND ($sourceName IS NULL OR source_name = $sourceName)`,
      )
      .all({ teamId, sourceName: sourceName ?? null }) as Row[];
  }

  private getPlayerRowsByIdentity(
    projectId: string,
    sourceName: SourceName,
    team: Row | undefined,
    player: PlayerInput,
  ): Row[] {
    if (!isStablePlayerIdentity(player)) {
      if (!team) return [];
      return this.database
        .prepare(
          `SELECT * FROM players WHERE project_id = $projectId AND team_id = $teamId
           AND source_name = $sourceName AND source_id = $sourceId
           ORDER BY updated_at DESC, id DESC`,
        )
        .all({
          projectId,
          sourceName,
          teamId: team['id'],
          sourceId: playerIdentity(player),
        }) as Row[];
    }
    return this.database
      .prepare(
        `SELECT * FROM players WHERE project_id = $projectId AND source_name = $sourceName
         AND source_id = $sourceId ORDER BY updated_at DESC, id DESC`,
      )
      .all({ projectId, sourceName, sourceId: player.sourceId }) as Row[];
  }

  private getLeagueName(id: string): string {
    const row = this.database.prepare('SELECT name FROM leagues WHERE id = $id').get({ id }) as
      Row | undefined;
    return row ? String(row['name']) : 'Unknown league';
  }

  private getTeamName(id: string): string {
    const row = this.database.prepare('SELECT name FROM teams WHERE id = $id').get({ id }) as
      Row | undefined;
    return row ? String(row['name']) : 'Unknown team';
  }

  private touchProject(projectId: string, updatedAt: string): void {
    this.database
      .prepare('UPDATE projects SET updated_at = $updatedAt WHERE id = $projectId')
      .run({ projectId, updatedAt });
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listCombinedEntityFilterOptions(
    request: CombinedEntityFilterOptionsRequest,
  ): CombinedEntityFilterOptions {
    if (!['leagues', 'teams', 'players'].includes(request.entity)) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The requested table is invalid.',
      });
    }
    this.getProjectSummary(request.projectId);
    if (request.entity === 'leagues') {
      const tiers = (
        this.database
          .prepare(
            `SELECT DISTINCT tier FROM combined_leagues
             WHERE project_id = $projectId AND tier IS NOT NULL ORDER BY tier ASC`,
          )
          .all({ projectId: request.projectId }) as Row[]
      ).map((row) => Number(row['tier']));
      const withoutTier = this.database
        .prepare(
          `SELECT EXISTS(
             SELECT 1 FROM combined_leagues
             WHERE project_id = $projectId AND tier IS NULL
           ) AS present`,
        )
        .get({ projectId: request.projectId }) as Row;
      return {
        entity: 'leagues',
        countries: this.listCountryOptions('combined_leagues', request.projectId),
        tiers,
        hasLeaguesWithoutTier: Boolean(withoutTier['present']),
        customBadges: this.listCombinedCustomBadges(),
      };
    }
    if (request.entity === 'teams') {
      const leagues = this.database
        .prepare(
          `SELECT id, name, country_name, country_code2, country_code3, tier
           FROM combined_leagues WHERE project_id = $projectId
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
        )
        .all({ projectId: request.projectId }) as Row[];
      const withoutLeague = this.database
        .prepare(
          `SELECT EXISTS(
             SELECT 1 FROM combined_teams
             WHERE project_id = $projectId AND league_id IS NULL
           ) AS present`,
        )
        .get({ projectId: request.projectId }) as Row;
      return {
        entity: 'teams',
        leagues: leagues.map((row) => {
          const countryCode2 = optionalString(row['country_code2']);
          const countryCode3 = optionalString(row['country_code3']);
          return {
            id: String(row['id']),
            name: String(row['name']),
            countryName: optionalString(row['country_name']),
            countryCode: countryCode3
              ? (findFootballCountryByCode3(countryCode3)?.flagCode ?? countryCode2)
              : countryCode2,
            tier: optionalNumber(row['tier']),
          };
        }),
        hasTeamsWithoutLeague: Boolean(withoutLeague['present']),
        countries: this.listCountryOptions('combined_teams', request.projectId),
        customBadges: this.listCombinedCustomBadges(),
      };
    }
    const teams = this.database
      .prepare(
        `SELECT id, name FROM combined_teams WHERE project_id = $projectId
         ORDER BY name COLLATE NOCASE ASC, id ASC`,
      )
      .all({ projectId: request.projectId }) as Row[];
    const presentPositions = new Set(
      this.listDistinctText('combined_players', 'position', request.projectId),
    );
    const presentPositionDetails = new Set(
      this.listDistinctText('combined_players', 'position_detail', request.projectId),
    );
    const presentFeet = new Set(
      this.listDistinctText('combined_players', 'foot', request.projectId),
    );
    return {
      entity: 'players',
      teams: teams.map((row) => ({
        id: String(row['id']),
        name: String(row['name']),
      })),
      nationalities: this.listNationalityOptions(request.projectId, 'combined_players'),
      positions: playerPositions.filter((position) => presentPositions.has(position)),
      positionDetails: playerPositionDetails.filter((positionDetail) =>
        presentPositionDetails.has(positionDetail),
      ),
      feet: playerFeet.filter((foot) => presentFeet.has(foot)),
      customBadges: this.listCombinedCustomBadges(),
    };
  }

  listCombinedEntities(request: CombinedPageRequest): Page<CombinedEntity> {
    this.getProjectSummary(request.projectId);
    if (!['leagues', 'teams', 'players'].includes(request.entity)) {
      throw new ApplicationError({ code: 'INVALID_INPUT', message: 'Choose a valid table.' });
    }
    const pageIndex = Math.max(0, Math.floor(request.pageIndex));
    const pageSize = Math.min(200, Math.max(1, Math.floor(request.pageSize)));
    const search = `%${request.search.trim()}%`;
    const table = `combined_${request.entity}`;
    const sourceTable = {
      leagues: 'combined_league_sources',
      teams: 'combined_team_sources',
      players: 'combined_player_sources',
    }[request.entity];
    const sourceForeignKey = {
      leagues: 'combined_league_id',
      teams: 'combined_team_id',
      players: 'combined_player_id',
    }[request.entity];
    const rawIdColumn = {
      leagues: 'source_league_id',
      teams: 'source_team_id',
      players: 'source_player_id',
    }[request.entity];
    const parameters: Record<string, string | number> = {
      projectId: request.projectId,
      search,
    };
    const where = ['entity.project_id = $projectId', 'entity.name LIKE $search COLLATE NOCASE'];
    const addInFilter = (
      column: string,
      parameterPrefix: string,
      selectedValues: readonly (string | number)[],
    ): void => {
      if (!selectedValues.length) return;
      const placeholders = selectedValues.map((value, index) => {
        const key = `${parameterPrefix}${index}`;
        parameters[key] = value;
        return `$${key}`;
      });
      where.push(`${column} IN (${placeholders.join(', ')})`);
    };
    const sourceNames = uniqueStrings(request.sourceNames ?? []).filter(isSourceName);
    if (sourceNames.length) {
      const placeholders = sourceNames.map((sourceName, index) => {
        const key = `source${index}`;
        parameters[key] = sourceName;
        return `$${key}`;
      });
      where.push(`EXISTS (
        SELECT 1 FROM ${sourceTable} source_filter
        WHERE source_filter.${sourceForeignKey} = entity.id
          AND source_filter.source_name IN (${placeholders.join(', ')})
      )`);
    }
    const leagueIds = uniqueStrings([...(request.leagueIds ?? []), request.leagueId ?? '']);
    if (request.entity === 'teams' && (leagueIds.length || request.includeTeamsWithoutLeague)) {
      const leagueFilters: string[] = [];
      if (leagueIds.length) {
        const placeholders = leagueIds.map((leagueId, index) => {
          const key = `leagueId${index}`;
          parameters[key] = leagueId;
          return `$${key}`;
        });
        leagueFilters.push(`entity.league_id IN (${placeholders.join(', ')})`);
      }
      if (request.includeTeamsWithoutLeague) leagueFilters.push('entity.league_id IS NULL');
      where.push(`(${leagueFilters.join(' OR ')})`);
    }
    const teamIds = uniqueStrings([...(request.teamIds ?? []), request.teamId ?? '']);
    if (request.entity === 'players') {
      addInFilter('entity.team_id', 'teamId', teamIds);
    }
    const tiers = [
      ...new Set(
        (request.tiers ?? []).filter(
          (tier): tier is number =>
            typeof tier === 'number' &&
            Number.isInteger(tier) &&
            (leagueTiers as readonly number[]).includes(tier),
        ),
      ),
    ];
    if (request.entity === 'leagues' && (tiers.length || request.includeLeaguesWithoutTier)) {
      const tierFilters: string[] = [];
      if (tiers.length) {
        const placeholders = tiers.map((tier, index) => {
          const key = `tier${index}`;
          parameters[key] = tier;
          return `$${key}`;
        });
        tierFilters.push(`entity.tier IN (${placeholders.join(', ')})`);
      }
      if (request.includeLeaguesWithoutTier) tierFilters.push('entity.tier IS NULL');
      where.push(`(${tierFilters.join(' OR ')})`);
    }
    if (request.entity === 'leagues' || request.entity === 'teams') {
      addInFilter(
        'entity.country_name COLLATE NOCASE',
        'country',
        uniqueStrings(request.countries ?? []),
      );
    }
    if (request.entity === 'players') {
      addInFilter(
        'entity.country_name COLLATE NOCASE',
        'nationality',
        uniqueStrings(request.nationalities ?? []),
      );
      addInFilter(
        'entity.position',
        'position',
        uniqueStrings(request.positions ?? []).filter((position) =>
          playerPositions.includes(position as (typeof playerPositions)[number]),
        ),
      );
      addInFilter(
        'entity.position_detail',
        'positionDetail',
        uniqueStrings(request.positionDetails ?? []).filter((positionDetail) =>
          playerPositionDetails.includes(positionDetail as (typeof playerPositionDetails)[number]),
        ),
      );
      addInFilter(
        'entity.foot',
        'foot',
        uniqueStrings(request.feet ?? []).filter((foot) =>
          playerFeet.includes(foot as (typeof playerFeet)[number]),
        ),
      );
    }
    const orphanExpression =
      request.entity === 'teams'
        ? `(EXISTS (
             SELECT 1 FROM combined_team_sources review_source
             WHERE review_source.combined_team_id = entity.id
               AND review_source.source_team_id IS NULL
           ) OR EXISTS (
             SELECT 1 FROM combined_players review_player
             JOIN combined_player_sources review_player_source
               ON review_player_source.combined_player_id = review_player.id
             WHERE review_player.team_id = entity.id
               AND review_player_source.source_player_id IS NULL
           ))`
        : `EXISTS (
             SELECT 1 FROM ${sourceTable} review_source
             WHERE review_source.${sourceForeignKey} = entity.id
               AND review_source.${rawIdColumn} IS NULL
           )`;
    const badgeFilters: string[] = [];
    if (request.needsReview !== undefined) {
      badgeFilters.push(`${request.needsReview ? '' : 'NOT '}${orphanExpression}`);
    }
    const requestedCustomBadgeIds = uniqueStrings(request.customBadgeIds ?? []);
    const availableCustomBadgeIds = requestedCustomBadgeIds.length
      ? new Set(this.listCombinedCustomBadges().map(({ id }) => id))
      : new Set<string>();
    const customBadgeIds = requestedCustomBadgeIds.filter((id) => availableCustomBadgeIds.has(id));
    if (customBadgeIds.length) {
      const placeholders = customBadgeIds.map((id, index) => {
        const key = `combinedCustomBadgeId${index}`;
        parameters[key] = id;
        return `$${key}`;
      });
      const assignment = combinedCustomBadgeAssignmentTables[request.entity];
      badgeFilters.push(
        `EXISTS (
           SELECT 1 FROM ${assignment.table} combined_custom_badge_assignment
           WHERE combined_custom_badge_assignment.${assignment.entityIdColumn} = entity.id
             AND combined_custom_badge_assignment.badge_id IN (${placeholders.join(', ')})
         )`,
      );
    }
    if (badgeFilters.length) where.push(`(${badgeFilters.join(' OR ')})`);
    const whereClause = where.join(' AND ');
    const total = Number(
      (
        this.database
          .prepare(`SELECT count(*) AS count FROM ${table} entity WHERE ${whereClause}`)
          .get(parameters) as Row
      )['count'],
    );
    const pageParameters = {
      ...parameters,
      limit: pageSize,
      offset: pageIndex * pageSize,
    };
    const rows = this.database
      .prepare(
        `SELECT entity.*,
           ${
             request.entity === 'leagues'
               ? `(SELECT count(*) FROM combined_teams WHERE league_id = entity.id) AS team_count,
                  (SELECT count(*) FROM combined_players player
                   JOIN combined_teams team ON team.id = player.team_id
                   WHERE team.league_id = entity.id) AS player_count,`
               : ''
           }
           ${
             request.entity === 'teams'
               ? '(SELECT count(*) FROM combined_players WHERE team_id = entity.id) AS player_count,'
               : ''
           }
           ${request.entity === 'teams' ? 'league.name AS league_name,' : ''}
           ${request.entity === 'players' ? 'team.name AS team_name, league.name AS league_name,' : ''}
           ${orphanExpression} AS needs_review
         FROM ${table} entity
         ${request.entity === 'teams' ? 'LEFT JOIN combined_leagues league ON league.id = entity.league_id' : ''}
         ${
           request.entity === 'players'
             ? `LEFT JOIN combined_teams team ON team.id = entity.team_id
                LEFT JOIN combined_leagues league ON league.id = team.league_id`
             : ''
         }
         WHERE ${whereClause}
         ORDER BY entity.name COLLATE NOCASE ${request.direction === 'desc' ? 'DESC' : 'ASC'},
                  entity.id ASC
         LIMIT $limit OFFSET $offset`,
      )
      .all(pageParameters) as Row[];
    return {
      rows: this.attachCombinedCustomBadges(
        request.entity,
        rows.map((row) => this.toCombinedEntity(request.entity, row)),
      ),
      total,
      pageIndex,
      pageSize,
    };
  }

  listCombineTeamCandidates(input: {
    projectId: string;
    sourceName?: SourceName;
    leagueId?: string;
    search: string;
    combinedTeamId?: string;
  }): CombineTeamCandidate[] {
    this.getProjectSummary(input.projectId);
    const rows = this.database
      .prepare(
        `SELECT team.*, league.name AS league_name,
           combined_source.combined_team_id,
           combined.name AS combined_team_name,
           (SELECT count(*) FROM players WHERE team_id = team.id) AS player_count
         FROM teams team
         LEFT JOIN leagues league ON league.id = team.league_id
         LEFT JOIN combined_team_sources combined_source ON combined_source.source_team_id = team.id
         LEFT JOIN combined_teams combined ON combined.id = combined_source.combined_team_id
         WHERE team.project_id = $projectId
           AND ($sourceName IS NULL OR team.source_name = $sourceName)
           AND ($leagueId IS NULL OR team.league_id = $leagueId)
           AND (team.name LIKE $search COLLATE NOCASE OR team.source_id LIKE $search)
         ORDER BY (combined_source.combined_team_id = $combinedTeamId) DESC,
                  team.name COLLATE NOCASE ASC, team.id ASC
         LIMIT 100`,
      )
      .all({
        projectId: input.projectId,
        sourceName: input.sourceName ?? null,
        leagueId: input.leagueId ?? null,
        combinedTeamId: input.combinedTeamId ?? '',
        search: `%${input.search.trim()}%`,
      }) as Row[];
    return rows.map((row) => ({
      ...this.toTeam(row),
      ...(row['combined_team_id']
        ? {
            combinedTeamId: String(row['combined_team_id']),
            combinedTeamName: String(row['combined_team_name']),
          }
        : {}),
    }));
  }

  previewTeamCombination(request: {
    projectId: string;
    sourceTeamIds: string[];
    combinedTeamId?: string;
  }): TeamCombinationPreview {
    const sourceTeams = this.validateCombinationTeams(
      request.projectId,
      request.sourceTeamIds,
      request.combinedTeamId,
    );
    const priority = this.getSourcePriority();
    const players = this.listSourcePlayers(sourceTeams);
    const existing = request.combinedTeamId
      ? this.loadExistingPlayerGroups(request.combinedTeamId, players)
      : { groups: [] as PlayerMatchGroup[], resolutions: {} as Record<string, FieldResolutions> };
    const groupedIds = new Set(
      existing.groups.flatMap((group) => group.players.map(({ id }) => id)),
    );
    const matchGroups = [
      ...existing.groups,
      ...identifyPlayers(
        players.filter(({ id }) => !groupedIds.has(id)),
        priority,
      ),
    ];
    const sourceLeagues = this.listSourceLeagues(sourceTeams);
    const detectedCombinedLeagueId = this.detectCombinedLeagueId(
      request.projectId,
      request.combinedTeamId,
      sourceLeagues,
    );
    const listedCombinedLeagues = this.listCombinedEntities({
      projectId: request.projectId,
      entity: 'leagues',
      pageIndex: 0,
      pageSize: 200,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows as CombinedLeague[];
    const combinedLeagues =
      detectedCombinedLeagueId &&
      !listedCombinedLeagues.some(({ id }) => id === detectedCombinedLeagueId)
        ? [this.getCombinedLeague(detectedCombinedLeagueId), ...listedCombinedLeagues]
        : listedCombinedLeagues;
    const existingResolutions = request.combinedTeamId
      ? this.readResolutions(
          this.database
            .prepare(
              'SELECT resolutions FROM combined_teams WHERE project_id = $projectId AND id = $id',
            )
            .get({ projectId: request.projectId, id: request.combinedTeamId }) as Row | undefined,
        )
      : {};
    return {
      sourceTeams,
      matchGroups,
      sourceLeagues,
      combinedLeagues,
      detectedCombinedLeagueId,
      existingResolutions,
      existingPlayerResolutions: existing.resolutions,
      conflicts: [
        ...this.collectTeamConflicts(sourceTeams, priority, existingResolutions),
        ...collectPlayerConflicts(matchGroups, priority, existing.resolutions),
      ],
    };
  }

  private detectCombinedLeagueId(
    projectId: string,
    combinedTeamId: string | undefined,
    sourceLeagues: readonly League[],
  ): string | undefined {
    if (combinedTeamId) {
      const currentLeague = this.database
        .prepare(
          `SELECT league_id FROM combined_teams
           WHERE project_id = $projectId AND id = $combinedTeamId`,
        )
        .get({ projectId, combinedTeamId }) as Row | undefined;
      const currentLeagueId = currentLeague
        ? optionalString(currentLeague['league_id'])
        : undefined;
      if (currentLeagueId) return currentLeagueId;
    }

    if (!sourceLeagues.length) return undefined;
    const parameters = Object.fromEntries(
      sourceLeagues.map(({ id }, index) => [`sourceLeagueId${index}`, id]),
    );
    const placeholders = sourceLeagues.map((_, index) => `$sourceLeagueId${index}`).join(', ');
    const matches = this.database
      .prepare(
        `SELECT DISTINCT source.combined_league_id
         FROM combined_league_sources source
         JOIN combined_leagues league ON league.id = source.combined_league_id
         WHERE league.project_id = $projectId
           AND source.source_league_id IN (${placeholders})
         LIMIT 2`,
      )
      .all({ projectId, ...parameters }) as Row[];
    return matches.length === 1 ? String(matches[0]['combined_league_id']) : undefined;
  }

  commitTeamCombination(request: CommitTeamCombinationRequest): TeamCombinationResult {
    const sourceTeams = this.validateCombinationTeams(
      request.projectId,
      request.sourceTeamIds,
      request.combinedTeamId,
    );
    const sourcePlayers = this.listSourcePlayers(sourceTeams);
    this.validateMatchGroups(sourcePlayers, request.matchGroups);
    const selectedPlayerGroupIds = this.validateSelectedPlayerGroups(
      request.matchGroups,
      request.selectedPlayerGroupIds,
    );
    const priority = this.getSourcePriority();
    return this.transaction(() => {
      const now = new Date().toISOString();
      const league = this.resolveCombinedLeague(request, sourceTeams, priority, now);
      const teamId = request.combinedTeamId ?? crypto.randomUUID();
      const existingTeam = request.combinedTeamId
        ? (this.database
            .prepare('SELECT * FROM combined_teams WHERE project_id = $projectId AND id = $id')
            .get({ projectId: request.projectId, id: request.combinedTeamId }) as Row | undefined)
        : undefined;
      if (request.combinedTeamId && !existingTeam) {
        throw new ApplicationError({
          code: 'NOT_FOUND',
          message: 'The combined team was not found.',
        });
      }
      const teamValues = this.resolveCombinedTeamValues(
        sourceTeams,
        priority,
        request.teamResolutions,
      );
      this.database
        .prepare(
          `INSERT INTO combined_teams(
             id, project_id, league_id, name, country_name, country_code2, country_code3,
             season, resolutions, created_at, updated_at
           ) VALUES (
             $id, $projectId, $leagueId, $name, $countryName, $countryCode2, $countryCode3,
             $season, $resolutions, $createdAt, $updatedAt
           )
           ON CONFLICT(id) DO UPDATE SET
             league_id = excluded.league_id, name = excluded.name,
             country_name = excluded.country_name, country_code2 = excluded.country_code2,
             country_code3 = excluded.country_code3, season = excluded.season,
             resolutions = excluded.resolutions, updated_at = excluded.updated_at`,
        )
        .run({
          id: teamId,
          projectId: request.projectId,
          leagueId: league?.id ?? null,
          ...teamValues,
          resolutions: JSON.stringify(request.teamResolutions),
          createdAt: existingTeam?.['created_at'] ?? now,
          updatedAt: now,
        });
      this.replaceCombinedTeamSources(teamId, sourceTeams);

      const existingPlayerIds = new Set(
        (
          this.database
            .prepare('SELECT id FROM combined_players WHERE team_id = $teamId')
            .all({ teamId }) as Row[]
        ).map((row) => String(row['id'])),
      );
      const retainedPlayerIds = new Set<string>();
      let addedPlayers = 0;
      let updatedPlayers = 0;
      for (const group of request.matchGroups) {
        if (!selectedPlayerGroupIds.has(group.id)) continue;
        const linked = this.findCombinedPlayerForGroup(teamId, group);
        const playerId = linked ?? crypto.randomUUID();
        const resolutions = request.playerResolutions[group.id] ?? {};
        const player = resolvePlayer(group, priority, resolutions);
        if (!player.name.trim()) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'Every combined player must have a name.',
          });
        }
        this.upsertCombinedPlayer(playerId, request.projectId, teamId, player, resolutions, now);
        this.replaceCombinedPlayerSources(playerId, group.players);
        retainedPlayerIds.add(playerId);
        if (linked) updatedPlayers += 1;
        else addedPlayers += 1;
      }
      const deletedPlayerIds = [...existingPlayerIds].filter((id) => !retainedPlayerIds.has(id));
      for (const id of deletedPlayerIds) {
        this.database.prepare('DELETE FROM combined_players WHERE id = $id').run({ id });
      }
      this.touchProject(request.projectId, now);
      const team = this.getCombinedTeam(teamId);
      const players = this.listCombinedEntities({
        projectId: request.projectId,
        entity: 'players',
        pageIndex: 0,
        pageSize: 200,
        search: '',
        sort: 'name',
        direction: 'asc',
        teamId,
      }).rows as CombinedPlayer[];
      return {
        team,
        ...(league && { league }),
        players,
        addedPlayers,
        updatedPlayers,
        deletedPlayers: deletedPlayerIds.length,
      };
    });
  }

  deleteCombinedEntity(request: {
    projectId: string;
    entity: CombinedEntityKind;
    id: string;
    cascade?: boolean;
  }): ProjectSummary {
    this.getProjectSummary(request.projectId);
    const table = `combined_${request.entity}`;
    const existing = this.database
      .prepare(`SELECT id FROM ${table} WHERE project_id = $projectId AND id = $id`)
      .get({ projectId: request.projectId, id: request.id });
    if (!existing) {
      throw new ApplicationError({ code: 'NOT_FOUND', message: 'Combined record was not found.' });
    }
    return this.transaction(() => {
      if (request.entity === 'leagues' && request.cascade) {
        this.database
          .prepare('DELETE FROM combined_teams WHERE project_id = $projectId AND league_id = $id')
          .run({ projectId: request.projectId, id: request.id });
      }
      this.database
        .prepare(`DELETE FROM ${table} WHERE project_id = $projectId AND id = $id`)
        .run({ projectId: request.projectId, id: request.id });
      this.touchProject(request.projectId, new Date().toISOString());
      return this.getProjectSummary(request.projectId);
    });
  }

  deleteCombinedPlayers(request: DeleteCombinedPlayersRequest): ProjectSummary {
    const query = this.prepareCombinedEntitySelection(request.projectId, 'players', request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.database
        .prepare(
          `DELETE FROM combined_players
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  deleteCombinedLeagues(request: DeleteCombinedLeaguesRequest): ProjectSummary {
    const query = this.prepareCombinedEntitySelection(request.projectId, 'leagues', request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      if (request.cascade) {
        this.database
          .prepare(
            `DELETE FROM combined_teams
             WHERE project_id = $projectId AND league_id IN (${query.idFilter})`,
          )
          .run(query.parameters);
      }
      this.database
        .prepare(
          `DELETE FROM combined_leagues
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  deleteCombinedTeams(request: DeleteCombinedTeamsRequest): ProjectSummary {
    const query = this.prepareCombinedEntitySelection(request.projectId, 'teams', request.ids);
    return this.transaction(() => {
      const now = new Date().toISOString();
      this.database
        .prepare(
          `DELETE FROM combined_teams
           WHERE project_id = $projectId AND id IN (${query.idFilter})`,
        )
        .run(query.parameters);
      this.touchProject(request.projectId, now);
      return this.getProjectSummary(request.projectId);
    });
  }

  private validateCombinationTeams(
    projectId: string,
    sourceTeamIds: string[],
    combinedTeamId?: string,
  ): CombineTeamCandidate[] {
    const ids = uniqueStrings(sourceTeamIds);
    if (ids.length < 1 || ids.length > sourceNames.length) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose between one and four source teams.',
      });
    }
    const placeholders = ids.map((_, index) => `$id${index}`);
    const parameters: Record<string, string> = { projectId };
    ids.forEach((id, index) => {
      parameters[`id${index}`] = id;
    });
    const rows = this.database
      .prepare(
        `SELECT team.*, league.name AS league_name,
           combined_source.combined_team_id, combined.name AS combined_team_name,
           (SELECT count(*) FROM players WHERE team_id = team.id) AS player_count
         FROM teams team
         LEFT JOIN leagues league ON league.id = team.league_id
         LEFT JOIN combined_team_sources combined_source ON combined_source.source_team_id = team.id
         LEFT JOIN combined_teams combined ON combined.id = combined_source.combined_team_id
         WHERE team.project_id = $projectId AND team.id IN (${placeholders.join(', ')})`,
      )
      .all(parameters) as Row[];
    if (rows.length !== ids.length) {
      throw new ApplicationError({
        code: 'NOT_FOUND',
        message: 'One or more source teams were not found.',
      });
    }
    const providers = new Set(rows.map((row) => String(row['source_name'])));
    if (providers.size !== rows.length) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose no more than one team from each provider.',
      });
    }
    for (const row of rows) {
      const owner = optionalString(row['combined_team_id']);
      if (owner && owner !== combinedTeamId) {
        throw new ApplicationError({
          code: 'CONFLICT',
          message: `${String(row['name'])} already belongs to ${String(row['combined_team_name'])}.`,
        });
      }
    }
    const priority = this.getSourcePriority();
    return rows
      .map((row) => ({
        ...this.toTeam(row),
        ...(row['combined_team_id']
          ? {
              combinedTeamId: String(row['combined_team_id']),
              combinedTeamName: String(row['combined_team_name']),
            }
          : {}),
      }))
      .sort(
        (left, right) => priority.indexOf(left.sourceName) - priority.indexOf(right.sourceName),
      );
  }

  private listSourcePlayers(teams: readonly Team[]): PlayerSourceRecord[] {
    const ids = teams.map(({ id }) => id);
    const placeholders = ids.map((_, index) => `$team${index}`);
    const parameters: Record<string, string> = {};
    ids.forEach((id, index) => {
      parameters[`team${index}`] = id;
    });
    const rows = this.database
      .prepare(
        `SELECT player.*, team.name AS team_name
         FROM players player
         JOIN teams team ON team.id = player.team_id
         WHERE player.team_id IN (${placeholders.join(', ')})
         ORDER BY player.name COLLATE NOCASE ASC, player.id ASC`,
      )
      .all(parameters) as Row[];
    return rows.map((row) => {
      const player = this.toPlayer(row);
      return {
        id: player.id,
        sourceName: player.sourceName,
        sourceUrl: player.sourceUrl,
        teamId: player.teamId,
        teamName: player.teamName ?? '',
        sourceId: player.sourceId,
        name: player.name,
        firstName: player.firstName,
        lastName: player.lastName,
        jerseyNumber: player.jerseyNumber,
        position: player.position,
        positionDetail: player.positionDetail,
        birthdate: player.birthdate,
        height: player.height,
        weight: player.weight,
        foot: player.foot,
        joined: player.joined,
        contractExpires: player.contractExpires,
        marketValue: player.marketValue,
        countryName: player.countryName,
        countryCode2: player.countryCode2,
        countryCode3: player.countryCode3,
        minutesPlayed: player.minutesPlayed,
      };
    });
  }

  private listSourceLeagues(teams: readonly Team[]): League[] {
    const ids = uniqueStrings(teams.map(({ leagueId }) => leagueId ?? ''));
    if (!ids.length) return [];
    const placeholders = ids.map((_, index) => `$id${index}`);
    const parameters: Record<string, string> = {};
    ids.forEach((id, index) => {
      parameters[`id${index}`] = id;
    });
    const rows = this.database
      .prepare(
        `SELECT league.*,
           (SELECT count(*) FROM teams WHERE league_id = league.id) AS team_count,
           (SELECT count(*) FROM players player JOIN teams team ON team.id = player.team_id
             WHERE team.league_id = league.id) AS player_count
         FROM leagues league WHERE league.id IN (${placeholders.join(', ')})`,
      )
      .all(parameters) as Row[];
    return rows.map((row) => this.toLeague(row));
  }

  private collectTeamConflicts(
    teams: readonly Team[],
    priority: readonly SourceName[],
    resolutions: FieldResolutions,
  ): FieldConflict[] {
    const fields = ['name', 'countryName', 'countryCode2', 'countryCode3', 'season'] as const;
    return fields.flatMap((field) => {
      const values = teams
        .map((team) => ({
          sourceName: team.sourceName,
          value: team[field],
        }))
        .filter(({ value }) => value !== undefined && value !== '');
      if (new Set(values.map(({ value }) => String(value))).size <= 1) return [];
      return [
        {
          entity: 'team' as const,
          entityId: 'team',
          field,
          values,
          resolution: resolutions[field],
          resolvedValue:
            field === 'name'
              ? resolveNameValue(values, priority, resolutions[field])
              : resolveValue(values, priority, resolutions[field]),
        },
      ];
    });
  }

  private readResolutions(row: Row | undefined): FieldResolutions {
    if (!row) return {};
    try {
      const value: unknown = JSON.parse(String(row['resolutions']));
      return isRecord(value) ? (value as FieldResolutions) : {};
    } catch {
      return {};
    }
  }

  private loadExistingPlayerGroups(
    combinedTeamId: string,
    availablePlayers: readonly PlayerSourceRecord[],
  ): { groups: PlayerMatchGroup[]; resolutions: Record<string, FieldResolutions> } {
    const available = new Map(availablePlayers.map((player) => [player.id, player]));
    const rows = this.database
      .prepare(
        `SELECT player.id AS combined_player_id, player.resolutions, source.source_player_id
         FROM combined_players player
         JOIN combined_player_sources source ON source.combined_player_id = player.id
         WHERE player.team_id = $combinedTeamId AND source.source_player_id IS NOT NULL
         ORDER BY player.id, source.source_name`,
      )
      .all({ combinedTeamId }) as Row[];
    const grouped = new Map<string, PlayerSourceRecord[]>();
    const resolutions: Record<string, FieldResolutions> = {};
    for (const row of rows) {
      const sourcePlayer = available.get(String(row['source_player_id']));
      if (!sourcePlayer) continue;
      const id = String(row['combined_player_id']);
      const players = grouped.get(id) ?? [];
      players.push(sourcePlayer);
      grouped.set(id, players);
      resolutions[id] = this.readResolutions(row);
    }
    return {
      groups: [...grouped.entries()].map(([id, players]) => ({
        id,
        players,
        automatic: false,
        ambiguous: false,
      })),
      resolutions,
    };
  }

  private validateMatchGroups(
    sourcePlayers: readonly PlayerSourceRecord[],
    groups: readonly PlayerMatchGroup[],
  ): void {
    const expected = new Set(sourcePlayers.map(({ id }) => id));
    const selected = new Set<string>();
    const groupIds = new Set<string>();
    for (const group of groups) {
      const providers = new Set<SourceName>();
      if (!group.players.length) {
        throw new ApplicationError({ code: 'INVALID_INPUT', message: 'A player group is empty.' });
      }
      if (!group.id || groupIds.has(group.id)) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Player match groups are invalid.',
        });
      }
      groupIds.add(group.id);
      for (const player of group.players) {
        if (
          !expected.has(player.id) ||
          selected.has(player.id) ||
          providers.has(player.sourceName)
        ) {
          throw new ApplicationError({
            code: 'INVALID_INPUT',
            message: 'Player match groups are invalid.',
          });
        }
        selected.add(player.id);
        providers.add(player.sourceName);
      }
    }
    if (selected.size !== expected.size) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Every source player must appear in exactly one match group.',
      });
    }
  }

  private validateSelectedPlayerGroups(
    groups: readonly PlayerMatchGroup[],
    selectedGroupIds: readonly string[],
  ): Set<string> {
    if (!selectedGroupIds.length) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Select at least one project player.',
      });
    }
    const available = new Set(groups.map(({ id }) => id));
    const selected = new Set<string>();
    for (const id of selectedGroupIds) {
      if (!available.has(id) || selected.has(id)) {
        throw new ApplicationError({
          code: 'INVALID_INPUT',
          message: 'Selected player groups are invalid.',
        });
      }
      selected.add(id);
    }
    return selected;
  }

  private resolveCombinedTeamValues(
    teams: readonly Team[],
    priority: readonly SourceName[],
    resolutions: FieldResolutions,
  ): {
    name: string;
    countryName: string | null;
    countryCode2: string | null;
    countryCode3: string | null;
    season: string;
  } {
    const field = (key: 'name' | 'countryName' | 'countryCode2' | 'countryCode3' | 'season') =>
      key === 'name'
        ? resolveNameValue(
            teams.map((team) => ({
              sourceName: team.sourceName,
              value: team.name,
            })),
            priority,
            resolutions['name'],
          )
        : resolveValue(
            teams.map((team) => ({
              sourceName: team.sourceName,
              value: team[key],
            })),
            priority,
            resolutions[key],
          );
    const name = field('name')?.trim();
    if (!name) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The combined team name is required.',
      });
    }
    const countrySource =
      (['countryName', 'countryCode2', 'countryCode3'] as const)
        .map((key) => resolutions[key])
        .find((resolution) => resolution?.mode === 'source')?.sourceName ??
      priority.find((sourceName) =>
        teams.some(
          (team) =>
            team.sourceName === sourceName &&
            [team.countryName, team.countryCode2, team.countryCode3].some(Boolean),
        ),
      );
    const countryTeam = teams.find(({ sourceName }) => sourceName === countrySource);
    const countryField = (key: 'countryName' | 'countryCode2' | 'countryCode3') =>
      resolutions[key]?.mode === 'custom' ? field(key) : countryTeam?.[key];
    return {
      name,
      countryName: countryField('countryName') ?? null,
      countryCode2: countryField('countryCode2') ?? null,
      countryCode3: countryField('countryCode3') ?? null,
      season: field('season') ?? '',
    };
  }

  private resolveCombinedLeague(
    request: CommitTeamCombinationRequest,
    teams: readonly Team[],
    priority: readonly SourceName[],
    now: string,
  ): CombinedLeague | undefined {
    if (request.league.kind === 'none') return undefined;
    if (request.league.kind === 'existing') {
      const league = this.database
        .prepare('SELECT id FROM combined_leagues WHERE project_id = $projectId AND id = $leagueId')
        .get({ projectId: request.projectId, leagueId: request.league.combinedLeagueId });
      if (!league) {
        throw new ApplicationError({
          code: 'NOT_FOUND',
          message: 'The combined league was not found.',
        });
      }
      const existingSources = new Set(
        (
          this.database
            .prepare(
              `SELECT source_name FROM combined_league_sources
               WHERE combined_league_id = $combinedLeagueId`,
            )
            .all({ combinedLeagueId: request.league.combinedLeagueId }) as Row[]
        ).map((row) => String(row['source_name'])),
      );
      const insert = this.database.prepare(
        `INSERT INTO combined_league_sources(
           id, combined_league_id, source_league_id, source_name, source_id, season, name
         ) VALUES ($id, $combinedLeagueId, $sourceLeagueId, $sourceName, $sourceId, $season, $name)`,
      );
      for (const sourceLeague of this.listSourceLeagues(teams)) {
        if (existingSources.has(sourceLeague.sourceName)) continue;
        insert.run({
          id: crypto.randomUUID(),
          combinedLeagueId: request.league.combinedLeagueId,
          sourceLeagueId: sourceLeague.id,
          sourceName: sourceLeague.sourceName,
          sourceId: sourceLeague.sourceId,
          season: sourceLeague.season ?? '',
          name: sourceLeague.name,
        });
      }
      return this.getCombinedLeague(request.league.combinedLeagueId);
    }
    const availableLeagueIds = new Set(uniqueStrings(teams.map(({ leagueId }) => leagueId ?? '')));
    const selectedIds = uniqueStrings(request.league.sourceLeagueIds);
    if (
      selectedIds.length === 0 ||
      selectedIds.some((sourceLeagueId) => !availableLeagueIds.has(sourceLeagueId))
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'Choose valid source leagues for the combined league.',
      });
    }
    const leagues = this.listSourceLeagues(teams).filter(({ id }) => selectedIds.includes(id));
    const id = crypto.randomUUID();
    const value = (
      key: 'name' | 'countryName' | 'countryCode2' | 'countryCode3' | 'season' | 'tier',
    ) =>
      key === 'name'
        ? resolveNameValue(
            leagues.map((league) => ({
              sourceName: league.sourceName,
              value: league.name,
            })),
            priority,
            request.league.kind === 'create' ? request.league.resolutions['name'] : undefined,
          )
        : resolveValue(
            leagues.map((league) => ({
              sourceName: league.sourceName,
              value: league[key],
            })),
            priority,
            request.league.kind === 'create' ? request.league.resolutions[key] : undefined,
          );
    const name = String(value('name') ?? '').trim();
    if (!name) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: 'The combined league name is required.',
      });
    }
    this.database
      .prepare(
        `INSERT INTO combined_leagues(
           id, project_id, name, tier, country_name, country_code2, country_code3,
           season, resolutions, created_at, updated_at
         ) VALUES (
           $id, $projectId, $name, $tier, $countryName, $countryCode2, $countryCode3,
           $season, $resolutions, $now, $now
         )`,
      )
      .run({
        id,
        projectId: request.projectId,
        name,
        tier: value('tier') ?? null,
        countryName: value('countryName') ?? null,
        countryCode2: value('countryCode2') ?? null,
        countryCode3: value('countryCode3') ?? null,
        season: value('season') ?? '',
        resolutions: JSON.stringify(request.league.resolutions),
        now,
      });
    const insert = this.database.prepare(
      `INSERT INTO combined_league_sources(
         id, combined_league_id, source_league_id, source_name, source_id, season, name
       ) VALUES ($id, $combinedLeagueId, $sourceLeagueId, $sourceName, $sourceId, $season, $name)`,
    );
    for (const league of leagues) {
      insert.run({
        id: crypto.randomUUID(),
        combinedLeagueId: id,
        sourceLeagueId: league.id,
        sourceName: league.sourceName,
        sourceId: league.sourceId,
        season: league.season ?? '',
        name: league.name,
      });
    }
    return this.getCombinedLeague(id);
  }

  private replaceCombinedTeamSources(combinedTeamId: string, sourceTeams: readonly Team[]): void {
    this.database
      .prepare('DELETE FROM combined_team_sources WHERE combined_team_id = $combinedTeamId')
      .run({ combinedTeamId });
    const insert = this.database.prepare(
      `INSERT INTO combined_team_sources(
         id, combined_team_id, source_team_id, source_name, source_id, season, name
       ) VALUES ($id, $combinedTeamId, $sourceTeamId, $sourceName, $sourceId, $season, $name)`,
    );
    for (const team of sourceTeams) {
      insert.run({
        id: crypto.randomUUID(),
        combinedTeamId,
        sourceTeamId: team.id,
        sourceName: team.sourceName,
        sourceId: team.sourceId,
        season: team.season ?? '',
        name: team.name,
      });
    }
  }

  private findCombinedPlayerForGroup(
    combinedTeamId: string,
    group: PlayerMatchGroup,
  ): string | undefined {
    const ids = group.players.map(({ id }) => id);
    const placeholders = ids.map((_, index) => `$id${index}`);
    const parameters: Record<string, string> = { combinedTeamId };
    ids.forEach((id, index) => {
      parameters[`id${index}`] = id;
    });
    const row = this.database
      .prepare(
        `SELECT player.id
         FROM combined_players player
         JOIN combined_player_sources source ON source.combined_player_id = player.id
         WHERE player.team_id = $combinedTeamId
           AND source.source_player_id IN (${placeholders.join(', ')})
         ORDER BY player.updated_at DESC LIMIT 1`,
      )
      .get(parameters) as Row | undefined;
    return row ? String(row['id']) : undefined;
  }

  private upsertCombinedPlayer(
    id: string,
    projectId: string,
    teamId: string,
    player: PlayerInput,
    resolutions: FieldResolutions,
    now: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO combined_players(
           id, project_id, team_id, name, first_name, last_name, jersey_number, position,
           position_detail, birthdate, height, weight, foot, joined, contract_expires,
           market_value, country_name, country_code2, country_code3, minutes_played,
           resolutions, created_at, updated_at
         ) VALUES (
           $id, $projectId, $teamId, $name, $firstName, $lastName, $jerseyNumber, $position,
           $positionDetail, $birthdate, $height, $weight, $foot, $joined, $contractExpires,
           $marketValue, $countryName, $countryCode2, $countryCode3, $minutesPlayed,
           $resolutions, $now, $now
         )
         ON CONFLICT(id) DO UPDATE SET
           team_id = excluded.team_id, name = excluded.name, first_name = excluded.first_name,
           last_name = excluded.last_name, jersey_number = excluded.jersey_number,
           position = excluded.position, position_detail = excluded.position_detail,
           birthdate = excluded.birthdate, height = excluded.height, weight = excluded.weight,
           foot = excluded.foot, joined = excluded.joined,
           contract_expires = excluded.contract_expires, market_value = excluded.market_value,
           country_name = excluded.country_name, country_code2 = excluded.country_code2,
           country_code3 = excluded.country_code3, minutes_played = excluded.minutes_played,
           resolutions = excluded.resolutions, updated_at = excluded.updated_at`,
      )
      .run({
        id,
        projectId,
        teamId,
        name: player.name.trim(),
        firstName: player.firstName ?? null,
        lastName: player.lastName ?? null,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        positionDetail: player.positionDetail ?? null,
        birthdate: player.birthdate ?? null,
        height: player.height ?? null,
        weight: player.weight ?? null,
        foot: player.foot ?? null,
        joined: player.joined ?? null,
        contractExpires: player.contractExpires ?? null,
        marketValue: player.marketValue ?? null,
        countryName: player.countryName ?? null,
        countryCode2: player.countryCode2 ?? null,
        countryCode3: player.countryCode3 ?? null,
        minutesPlayed: player.minutesPlayed ?? null,
        resolutions: JSON.stringify(resolutions),
        now,
      });
  }

  private replaceCombinedPlayerSources(
    combinedPlayerId: string,
    players: readonly PlayerSourceRecord[],
  ): void {
    this.database
      .prepare('DELETE FROM combined_player_sources WHERE combined_player_id = $combinedPlayerId')
      .run({ combinedPlayerId });
    const insert = this.database.prepare(
      `INSERT INTO combined_player_sources(
         id, combined_player_id, source_player_id, source_name, source_id, name
       ) VALUES ($id, $combinedPlayerId, $sourcePlayerId, $sourceName, $sourceId, $name)`,
    );
    for (const player of players) {
      insert.run({
        id: crypto.randomUUID(),
        combinedPlayerId,
        sourcePlayerId: player.id,
        sourceName: player.sourceName,
        sourceId: player.sourceId ?? `name:${normalizePersonName(player.name)}`,
        name: player.name,
      });
    }
  }

  private combinedSources(entity: CombinedEntityKind, combinedId: string): CombinedSourceRef[] {
    const config = {
      leagues: {
        table: 'combined_league_sources',
        combined: 'combined_league_id',
        raw: 'source_league_id',
        kind: 'leagues' as const,
      },
      teams: {
        table: 'combined_team_sources',
        combined: 'combined_team_id',
        raw: 'source_team_id',
        kind: 'teams' as const,
      },
      players: {
        table: 'combined_player_sources',
        combined: 'combined_player_id',
        raw: 'source_player_id',
        kind: 'players' as const,
      },
    }[entity];
    const rows = this.database
      .prepare(
        `SELECT * FROM ${config.table} WHERE ${config.combined} = $combinedId
         ORDER BY source_name`,
      )
      .all({ combinedId }) as Row[];
    const priority = this.getSourcePriority();
    return rows
      .map((row) => {
        const sourceName = String(row['source_name']) as SourceName;
        const sourceId = String(row['source_id']);
        const season = optionalString(row['season']);
        return {
          recordId: optionalString(row[config.raw]),
          sourceName,
          sourceId,
          sourceUrl: buildSourceUrl(sourceName, config.kind, sourceId, season),
          season,
          name: String(row['name']),
          available: row[config.raw] !== null,
        };
      })
      .sort(
        (left, right) => priority.indexOf(left.sourceName) - priority.indexOf(right.sourceName),
      );
  }

  private toCombinedEntity(entity: CombinedEntityKind, row: Row): CombinedEntity {
    const common = {
      id: String(row['id']),
      projectId: String(row['project_id']),
      name: String(row['name']),
      sources: this.combinedSources(entity, String(row['id'])),
      needsReview: Boolean(row['needs_review']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      customBadges: [],
    };
    if (entity === 'leagues') {
      return {
        ...common,
        tier: optionalNumber(row['tier']),
        countryName: optionalString(row['country_name']),
        countryCode2: optionalString(row['country_code2']),
        countryCode3: optionalString(row['country_code3']),
        season: optionalString(row['season']),
        teamCount: optionalNumber(row['team_count']),
        playerCount: optionalNumber(row['player_count']),
      } satisfies CombinedLeague;
    }
    if (entity === 'teams') {
      return {
        ...common,
        leagueId: optionalString(row['league_id']),
        leagueName: optionalString(row['league_name']),
        countryName: optionalString(row['country_name']),
        countryCode2: optionalString(row['country_code2']),
        countryCode3: optionalString(row['country_code3']),
        season: optionalString(row['season']),
        playerCount: optionalNumber(row['player_count']),
      } satisfies CombinedTeam;
    }
    return {
      ...common,
      teamId: String(row['team_id']),
      teamName: optionalString(row['team_name']),
      leagueName: optionalString(row['league_name']),
      firstName: optionalString(row['first_name']),
      lastName: optionalString(row['last_name']),
      jerseyNumber: optionalNumber(row['jersey_number']),
      position: optionalString(row['position']) as Player['position'],
      positionDetail: optionalString(row['position_detail']) as Player['positionDetail'],
      birthdate: optionalString(row['birthdate']),
      height: optionalNumber(row['height']),
      weight: optionalNumber(row['weight']),
      foot: optionalString(row['foot']) as Player['foot'],
      joined: optionalString(row['joined']),
      contractExpires: optionalString(row['contract_expires']),
      marketValue: optionalNumber(row['market_value']),
      countryName: optionalString(row['country_name']),
      countryCode2: optionalString(row['country_code2']),
      countryCode3: optionalString(row['country_code3']),
      minutesPlayed: optionalNumber(row['minutes_played']),
    } satisfies CombinedPlayer;
  }

  private getCombinedLeague(id: string): CombinedLeague {
    const row = this.database
      .prepare(
        `SELECT league.*,
           EXISTS (
             SELECT 1 FROM combined_league_sources source
             WHERE source.combined_league_id = league.id AND source.source_league_id IS NULL
           ) AS needs_review
         FROM combined_leagues league WHERE league.id = $id`,
      )
      .get({ id }) as Row | undefined;
    if (!row) {
      throw new ApplicationError({ code: 'NOT_FOUND', message: 'Combined league was not found.' });
    }
    return this.attachCombinedCustomBadges('leagues', [
      this.toCombinedEntity('leagues', row) as CombinedLeague,
    ])[0];
  }

  private getCombinedTeam(id: string): CombinedTeam {
    const row = this.database
      .prepare(
        `SELECT team.*, league.name AS league_name,
           EXISTS (
             SELECT 1 FROM combined_team_sources source
             WHERE source.combined_team_id = team.id AND source.source_team_id IS NULL
           ) OR EXISTS (
             SELECT 1 FROM combined_players player
             JOIN combined_player_sources source ON source.combined_player_id = player.id
             WHERE player.team_id = team.id AND source.source_player_id IS NULL
           ) AS needs_review
         FROM combined_teams team
         LEFT JOIN combined_leagues league ON league.id = team.league_id
         WHERE team.id = $id`,
      )
      .get({ id }) as Row | undefined;
    if (!row) {
      throw new ApplicationError({ code: 'NOT_FOUND', message: 'Combined team was not found.' });
    }
    return this.attachCombinedCustomBadges('teams', [
      this.toCombinedEntity('teams', row) as CombinedTeam,
    ])[0];
  }

  exportRows(projectId: string): { leagues: League[]; teams: Team[]; players: Player[] } {
    this.getProjectSummary(projectId);
    const collect = (entity: PageRequest['entity']): Entity[] => {
      const rows: Entity[] = [];
      let pageIndex = 0;
      let total = 1;
      while (rows.length < total) {
        const page = this.listEntities({
          projectId,
          entity,
          pageIndex,
          pageSize: 200,
          search: '',
          sort: 'name',
          direction: 'asc',
        });
        rows.push(...page.rows);
        total = page.total;
        pageIndex += 1;
      }
      return rows;
    };
    return {
      leagues: collect('leagues') as League[],
      teams: collect('teams') as Team[],
      players: collect('players') as Player[],
    };
  }

  exportCombinedRows(projectId: string): {
    leagues: CombinedLeague[];
    teams: CombinedTeam[];
    players: CombinedPlayer[];
  } {
    const collect = <Entity extends CombinedEntity>(entity: CombinedEntityKind): Entity[] => {
      const rows: Entity[] = [];
      let pageIndex = 0;
      let total = 1;
      while (rows.length < total) {
        const page = this.listCombinedEntities({
          projectId,
          entity,
          pageIndex,
          pageSize: 200,
          search: '',
          sort: 'name',
          direction: 'asc',
        });
        rows.push(...(page.rows as Entity[]));
        total = page.total;
        pageIndex += 1;
      }
      return rows;
    };
    return {
      leagues: collect<CombinedLeague>('leagues'),
      teams: collect<CombinedTeam>('teams'),
      players: collect<CombinedPlayer>('players'),
    };
  }

  private upsertLeague(
    projectId: string,
    sourceName: SourceName,
    league: NonNullable<CommitImportRequest['league']>,
    now: string,
    refresh: boolean,
  ): string {
    const id = crypto.randomUUID();
    this.database
      .prepare(
        `INSERT INTO leagues(
          id, project_id, source_name, source_id, name, season, created_at, updated_at
        )
        VALUES ($id, $projectId, $sourceName, $sourceId, $name, $season, $now, $now)
        ON CONFLICT(project_id, source_name, source_id, season) DO UPDATE SET
          name = CASE WHEN $refresh = 1 THEN excluded.name ELSE leagues.name END,
          updated_at = CASE WHEN $refresh = 1 THEN excluded.updated_at ELSE leagues.updated_at END`,
      )
      .run({
        id,
        projectId,
        sourceName,
        sourceId: league.sourceId,
        name: league.name,
        season: league.season ?? '',
        refresh: refresh ? 1 : 0,
        now,
      });
    return String(
      (
        this.database
          .prepare(
            `SELECT id FROM leagues WHERE project_id = $projectId AND source_name = $sourceName
          AND source_id = $sourceId AND season = $season`,
          )
          .get({
            projectId,
            sourceName,
            sourceId: league.sourceId,
            season: league.season ?? '',
          }) as Row
      )['id'],
    );
  }

  private upsertTeam(
    projectId: string,
    sourceName: SourceName,
    leagueId: string | undefined,
    team: CommitImportRequest['teams'][number],
    now: string,
    overrideName: boolean,
    refreshSource: boolean,
    applyLeague: boolean,
  ): string {
    const id = crypto.randomUUID();
    this.database
      .prepare(
        `INSERT INTO teams(
          id, project_id, league_id, source_name, source_id, name, season, created_at, updated_at
        )
        VALUES ($id, $projectId, $leagueId, $sourceName, $sourceId, $name, $season, $now, $now)
        ON CONFLICT(project_id, source_name, source_id, season) DO UPDATE SET
          league_id = CASE WHEN $applyLeague = 1 THEN excluded.league_id ELSE teams.league_id END,
          name = CASE WHEN $overrideName = 1 THEN excluded.name ELSE teams.name END,
          updated_at = CASE
            WHEN $applyLeague = 1 OR $overrideName = 1 OR $refreshSource = 1
            THEN excluded.updated_at ELSE teams.updated_at END`,
      )
      .run({
        id,
        projectId,
        sourceName,
        leagueId: leagueId ?? null,
        sourceId: team.sourceId,
        name: team.name,
        season: team.season ?? '',
        overrideName: overrideName ? 1 : 0,
        refreshSource: refreshSource ? 1 : 0,
        applyLeague: applyLeague ? 1 : 0,
        now,
      });
    return String(
      (
        this.database
          .prepare(
            `SELECT id FROM teams WHERE project_id = $projectId AND source_name = $sourceName
          AND source_id = $sourceId AND season = $season`,
          )
          .get({
            projectId,
            sourceName,
            sourceId: team.sourceId,
            season: team.season ?? '',
          }) as Row
      )['id'],
    );
  }

  private upsertPlayer(
    projectId: string,
    sourceName: SourceName,
    teamId: string,
    player: PlayerInput,
    now: string,
    overrideNames: boolean,
  ): void {
    const sourceId = player.sourceId ?? `name:${player.name.trim().toLocaleLowerCase('en')}`;
    this.database
      .prepare(
        `INSERT INTO players(
        id, project_id, team_id, source_name, source_id, name, first_name, last_name, jersey_number,
        position, position_detail, birthdate, height, weight, foot, joined, contract_expires, market_value,
        country_name, country_code2, country_code3, minutes_played, created_at, updated_at
      ) VALUES (
        $id, $projectId, $teamId, $sourceName, $sourceId, $name, $firstName, $lastName,
        $jerseyNumber, $position, $positionDetail, $birthdate, $height, $weight, $foot, $joined, $contractExpires,
        $marketValue, $countryName, $countryCode2, $countryCode3, $minutesPlayed, $now, $now
      ) ON CONFLICT(project_id, team_id, source_name, source_id) DO UPDATE SET
        name = CASE WHEN $overrideNames = 1 THEN excluded.name ELSE players.name END,
        first_name = CASE
          WHEN $overrideNames = 1 THEN excluded.first_name ELSE players.first_name END,
        last_name = CASE
          WHEN $overrideNames = 1 THEN excluded.last_name ELSE players.last_name END,
        jersey_number = excluded.jersey_number, position = excluded.position,
        position_detail = excluded.position_detail, birthdate = excluded.birthdate,
        height = excluded.height, weight = excluded.weight, foot = excluded.foot, joined = excluded.joined,
        contract_expires = excluded.contract_expires, market_value = excluded.market_value,
        country_name = excluded.country_name, country_code2 = excluded.country_code2,
        country_code3 = excluded.country_code3, minutes_played = excluded.minutes_played,
        updated_at = excluded.updated_at`,
      )
      .run({
        id: crypto.randomUUID(),
        projectId,
        sourceName,
        teamId,
        sourceId,
        name: player.name.trim(),
        firstName: player.firstName ?? null,
        lastName: player.lastName ?? null,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        positionDetail: player.positionDetail ?? null,
        birthdate: player.birthdate ?? null,
        height: player.height ?? null,
        weight: player.weight ?? null,
        foot: player.foot ?? null,
        joined: player.joined ?? null,
        contractExpires: player.contractExpires ?? null,
        marketValue: player.marketValue ?? null,
        countryName: player.countryName ?? null,
        countryCode2: player.countryCode2 ?? null,
        countryCode3: player.countryCode3 ?? null,
        minutesPlayed: player.minutesPlayed ?? null,
        overrideNames: overrideNames ? 1 : 0,
        now,
      });
  }

  private importPlayer(
    projectId: string,
    sourceName: SourceName,
    teamId: string,
    player: PlayerInput,
    now: string,
    refreshData: boolean,
    overrideNames: boolean,
    ownershipPolicy: 'keep' | 'move',
  ): void {
    const team = this.getEntityRow('teams', projectId, teamId);
    const rows = this.getPlayerRowsByIdentity(projectId, sourceName, team, player);
    if (!rows.length) {
      this.upsertPlayer(projectId, sourceName, teamId, player, now, true);
      return;
    }
    if (!isStablePlayerIdentity(player)) {
      if (refreshData) this.upsertPlayer(projectId, sourceName, teamId, player, now, overrideNames);
      return;
    }
    const canonical = rows[0];
    const legacyCopies = rows.length > 1;
    const differentTeam = canonical['team_id'] !== teamId;
    if (differentTeam && ownershipPolicy === 'keep' && !legacyCopies) return;

    for (const row of rows.slice(1)) {
      this.database.prepare('DELETE FROM players WHERE id = $id').run({ id: row['id'] });
    }
    const move = differentTeam && (ownershipPolicy === 'move' || legacyCopies);
    if (refreshData) {
      this.updatePlayerFromImport(
        String(canonical['id']),
        move ? teamId : String(canonical['team_id']),
        player,
        now,
        overrideNames,
      );
    } else if (move || legacyCopies) {
      this.database
        .prepare('UPDATE players SET team_id = $teamId, updated_at = $now WHERE id = $id')
        .run({ id: canonical['id'], teamId: move ? teamId : canonical['team_id'], now });
    }
  }

  private updatePlayerFromImport(
    id: string,
    teamId: string,
    player: PlayerInput,
    now: string,
    overrideNames: boolean,
  ): void {
    this.database
      .prepare(
        `UPDATE players SET
          team_id = $teamId,
          name = CASE WHEN $overrideNames = 1 THEN $name ELSE name END,
          first_name = CASE WHEN $overrideNames = 1 THEN $firstName ELSE first_name END,
          last_name = CASE WHEN $overrideNames = 1 THEN $lastName ELSE last_name END,
          jersey_number = $jerseyNumber, position = $position,
          position_detail = $positionDetail, birthdate = $birthdate,
          height = $height, weight = $weight, foot = $foot, joined = $joined,
          contract_expires = $contractExpires, market_value = $marketValue,
          country_name = $countryName, country_code2 = $countryCode2,
          country_code3 = $countryCode3, minutes_played = $minutesPlayed, updated_at = $now
         WHERE id = $id`,
      )
      .run({
        id,
        teamId,
        name: player.name.trim(),
        firstName: player.firstName ?? null,
        lastName: player.lastName ?? null,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        positionDetail: player.positionDetail ?? null,
        birthdate: player.birthdate ?? null,
        height: player.height ?? null,
        weight: player.weight ?? null,
        foot: player.foot ?? null,
        joined: player.joined ?? null,
        contractExpires: player.contractExpires ?? null,
        marketValue: player.marketValue ?? null,
        countryName: player.countryName ?? null,
        countryCode2: player.countryCode2 ?? null,
        countryCode3: player.countryCode3 ?? null,
        minutesPlayed: player.minutesPlayed ?? null,
        overrideNames: overrideNames ? 1 : 0,
        now,
      });
  }

  private toProject(row: Row): Project {
    return {
      id: String(row['id']),
      name: String(row['name']),
      referenceDate: String(row['reference_date']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    };
  }

  private toProjectSummary(row: Row): ProjectSummary {
    const storedSourceNames = new Set(
      String(row['source_names'] ?? '')
        .split(',')
        .filter(isSourceName),
    );
    return {
      ...this.toProject(row),
      databaseCount: Number(row['database_count'] ?? 0),
      leagueCount: Number(row['league_count']),
      teamCount: Number(row['team_count']),
      playerCount: Number(row['player_count']),
      combinedLeagueCount: Number(row['combined_league_count']),
      combinedTeamCount: Number(row['combined_team_count']),
      combinedPlayerCount: Number(row['combined_player_count']),
      sourceNames: sourceNames.filter((sourceName) => storedSourceNames.has(sourceName)),
    };
  }

  private fifaDatabaseCountExpression(): string {
    const hasFifaDatabases = Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'databases'")
        .get(),
    );
    return hasFifaDatabases ? '(SELECT count(*) FROM databases WHERE project_id = p.id)' : '0';
  }

  private tableExists(table: string): boolean {
    return Boolean(
      this.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table),
    );
  }

  private toLeague(row: Row): League {
    const sourceName = String(row['source_name']) as SourceName;
    const sourceId = String(row['source_id']);
    const season = optionalString(row['season']);
    return {
      id: String(row['id']),
      projectId: String(row['project_id']),
      sourceName,
      sourceId,
      name: String(row['name']),
      tier: optionalNumber(row['tier']),
      countryName: optionalString(row['country_name']),
      countryCode2: optionalString(row['country_code2']),
      countryCode3: optionalString(row['country_code3']),
      season,
      sourceUrl: buildSourceUrl(sourceName, 'leagues', sourceId, season) ?? '',
      teamCount: optionalNumber(row['team_count']),
      playerCount: optionalNumber(row['player_count']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      customBadges: [],
    };
  }

  private toTeam(row: Row): Team {
    const sourceName = String(row['source_name']) as SourceName;
    const sourceId = String(row['source_id']);
    const season = optionalString(row['season']);
    return {
      id: String(row['id']),
      projectId: String(row['project_id']),
      leagueId: optionalString(row['league_id']),
      leagueName: optionalString(row['league_name']),
      sourceName,
      sourceId,
      name: String(row['name']),
      countryName: optionalString(row['country_name']),
      countryCode2: optionalString(row['country_code2']),
      countryCode3: optionalString(row['country_code3']),
      season,
      sourceUrl: buildSourceUrl(sourceName, 'teams', sourceId, season) ?? '',
      playerCount: optionalNumber(row['player_count']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      customBadges: [],
    };
  }

  private toPlayer(row: Row): Player {
    const sourceName = String(row['source_name']) as SourceName;
    const sourceId = String(row['source_id']);
    const sourceUrl = buildSourceUrl(sourceName, 'players', sourceId);
    return {
      id: String(row['id']),
      projectId: String(row['project_id']),
      teamId: String(row['team_id']),
      ...(optionalString(row['team_name']) && { teamName: String(row['team_name']) }),
      leagueName: optionalString(row['league_name']),
      sourceName,
      sourceId,
      ...(sourceUrl && { sourceUrl }),
      name: String(row['name']),
      firstName: optionalString(row['first_name']),
      lastName: optionalString(row['last_name']),
      jerseyNumber: optionalNumber(row['jersey_number']),
      position: optionalString(row['position']) as Player['position'],
      positionDetail: optionalString(row['position_detail']) as Player['positionDetail'],
      birthdate: optionalString(row['birthdate']),
      height: optionalNumber(row['height']),
      weight: optionalNumber(row['weight']),
      foot: optionalString(row['foot']) as Player['foot'],
      joined: optionalString(row['joined']),
      contractExpires: optionalString(row['contract_expires']),
      marketValue: optionalNumber(row['market_value']),
      countryName: optionalString(row['country_name']),
      countryCode2: optionalString(row['country_code2']),
      countryCode3: optionalString(row['country_code3']),
      minutesPlayed: optionalNumber(row['minutes_played']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      customBadges: [],
    };
  }

  private toCustomBadge(row: Row): CustomBadge {
    return {
      id: String(row['id']),
      name: String(row['name']),
      description: String(row['description']),
      color: String(row['color']) as CustomBadgeColor,
    };
  }

  private toCombinedCustomBadge(row: Row): CombinedCustomBadge {
    return {
      id: String(row['id']),
      name: String(row['name']),
      description: String(row['description']),
      color: String(row['color']) as CustomBadgeColor,
    };
  }

  private attachCustomBadges<T extends Entity>(entity: EntityKind, rows: T[]): T[] {
    if (!rows.length) return rows;
    const { table, entityIdColumn } = customBadgeAssignmentTables[entity];
    const parameters: Record<string, string> = {};
    const placeholders = rows.map(({ id }, index) => {
      const key = `entityId${index}`;
      parameters[key] = id;
      return `$${key}`;
    });
    const assignments = this.database
      .prepare(
        `SELECT assignment.${entityIdColumn} AS entity_id, badges.*
         FROM ${table} assignment
         JOIN custom_badges badges ON badges.id = assignment.badge_id
         WHERE assignment.${entityIdColumn} IN (${placeholders.join(', ')})
         ORDER BY badges.name COLLATE NOCASE ASC, badges.id ASC`,
      )
      .all(parameters) as Row[];
    const byEntity = new Map<string, CustomBadge[]>();
    for (const assignment of assignments) {
      const entityId = String(assignment['entity_id']);
      const badges = byEntity.get(entityId) ?? [];
      badges.push(this.toCustomBadge(assignment));
      byEntity.set(entityId, badges);
    }
    return rows.map((row) => ({ ...row, customBadges: byEntity.get(row.id) ?? [] }));
  }

  private attachCombinedCustomBadges<T extends CombinedEntity>(
    entity: CombinedEntityKind,
    rows: T[],
  ): T[] {
    if (!rows.length) return rows;
    const { table, entityIdColumn } = combinedCustomBadgeAssignmentTables[entity];
    const parameters: Record<string, string> = {};
    const placeholders = rows.map(({ id }, index) => {
      const key = `combinedEntityId${index}`;
      parameters[key] = id;
      return `$${key}`;
    });
    const assignments = this.database
      .prepare(
        `SELECT assignment.${entityIdColumn} AS entity_id, badges.*
         FROM ${table} assignment
         JOIN combined_custom_badges badges ON badges.id = assignment.badge_id
         WHERE assignment.${entityIdColumn} IN (${placeholders.join(', ')})
         ORDER BY badges.name COLLATE NOCASE ASC, badges.id ASC`,
      )
      .all(parameters) as Row[];
    const byEntity = new Map<string, CombinedCustomBadge[]>();
    for (const assignment of assignments) {
      const entityId = String(assignment['entity_id']);
      const badges = byEntity.get(entityId) ?? [];
      badges.push(this.toCombinedCustomBadge(assignment));
      byEntity.set(entityId, badges);
    }
    return rows.map((row) => ({ ...row, customBadges: byEntity.get(row.id) ?? [] }));
  }

  private normalizeCustomBadgeInput(input: CreateCustomBadgeRequest | UpdateCustomBadgeRequest): {
    name: string;
    description: string;
    color: CustomBadgeColor;
  } {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (
      !name ||
      name.length > customBadgeLimits.name.max ||
      !description ||
      description.length > customBadgeLimits.description.max ||
      !isCustomBadgeColor(input.color)
    ) {
      throw new ApplicationError({
        code: 'INVALID_INPUT',
        message: `Enter a badge name using at most ${customBadgeLimits.name.max} characters, a description using at most ${customBadgeLimits.description.max} characters, and a valid color.`,
      });
    }
    return { name, description, color: input.color };
  }

  private listDistinctText(table: string, column: string, projectId: string): string[] {
    const rows = this.database
      .prepare(
        `SELECT DISTINCT ${column} AS value FROM ${table}
         WHERE project_id = $projectId AND ${column} IS NOT NULL AND trim(${column}) != ''
         ORDER BY value COLLATE NOCASE ASC`,
      )
      .all({ projectId }) as Row[];
    return rows.map((row) => String(row['value']));
  }

  private listSourceNames(table: string, projectId: string): SourceName[] {
    return this.listDistinctText(table, 'source_name', projectId).filter(isSourceName);
  }

  private listNationalityOptions(
    projectId: string,
    table: 'players' | 'combined_players' = 'players',
  ): NationalityFilterOption[] {
    const rows = this.database
      .prepare(
        `SELECT country_name AS name, country_code2 AS code FROM ${table}
         WHERE project_id = $projectId
           AND country_name IS NOT NULL
           AND trim(country_name) != ''
         ORDER BY name COLLATE NOCASE ASC, code COLLATE NOCASE ASC`,
      )
      .all({ projectId }) as Row[];
    const options = new Map<string, NationalityFilterOption>();
    for (const row of rows) {
      const name = String(row['name']);
      const code = optionalString(row['code']);
      const key = name.toLocaleLowerCase('en');
      const existing = options.get(key);
      if (!existing || (!existing.code && code)) options.set(key, { name, ...(code && { code }) });
    }
    return [...options.values()];
  }

  private listCountryOptions(
    table: 'leagues' | 'teams' | 'combined_leagues' | 'combined_teams',
    projectId: string,
  ): CountryFilterOption[] {
    const rows = this.database
      .prepare(
        `SELECT country_name AS name, country_code3 AS code FROM ${table}
         WHERE project_id = $projectId
           AND country_name IS NOT NULL
           AND trim(country_name) != ''
         ORDER BY name COLLATE NOCASE ASC, code COLLATE NOCASE ASC`,
      )
      .all({ projectId }) as Row[];
    const options = new Map<string, CountryFilterOption>();
    for (const row of rows) {
      const name = String(row['name']);
      const country = optionalString(row['code']);
      const code = country ? findFootballCountryByCode3(country)?.flagCode : undefined;
      const key = name.toLocaleLowerCase('en');
      const existing = options.get(key);
      if (!existing || (!existing.code && code)) options.set(key, { name, ...(code && { code }) });
    }
    return [...options.values()];
  }
}
