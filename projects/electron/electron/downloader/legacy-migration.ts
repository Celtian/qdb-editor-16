import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  LegacyMigrationCounts,
  LegacyMigrationPreview,
  LegacyMigrationProjectPreview,
  LegacyMigrationRequest,
  LegacyMigrationResult,
} from '../../shared/contracts.js';
import { closeDatabase, DatabaseSync, type SQLInputValue } from '../runtime-sqlite.js';

type Row = Record<string, SQLInputValue>;

const requiredLegacyTables = [
  'projects',
  'leagues',
  'teams',
  'players',
  'application_preferences',
  'custom_badges',
  'league_custom_badges',
  'team_custom_badges',
  'player_custom_badges',
  'combined_leagues',
  'combined_teams',
  'combined_players',
  'combined_league_sources',
  'combined_team_sources',
  'combined_player_sources',
  'combined_custom_badges',
  'combined_league_custom_badges',
  'combined_team_custom_badges',
  'combined_player_custom_badges',
] as const;

const emptyCounts = (): LegacyMigrationCounts => ({
  leagues: 0,
  teams: 0,
  players: 0,
  combinedLeagues: 0,
  combinedTeams: 0,
  combinedPlayers: 0,
});

const addCounts = (
  left: LegacyMigrationCounts,
  right: LegacyMigrationCounts,
): LegacyMigrationCounts => ({
  leagues: left.leagues + right.leagues,
  teams: left.teams + right.teams,
  players: left.players + right.players,
  combinedLeagues: left.combinedLeagues + right.combinedLeagues,
  combinedTeams: left.combinedTeams + right.combinedTeams,
  combinedPlayers: left.combinedPlayers + right.combinedPlayers,
});

const stringValue = (value: SQLInputValue | undefined): string =>
  typeof value === 'string' ? value : String(value ?? '');

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const normalizedProjectName = (name: string): string =>
  name.normalize('NFKC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('en');

export class LegacyDownloaderMigration {
  constructor(
    private readonly catalogPath: string,
    private readonly projectsDirectory: string,
  ) {}

  preview(sourcePath: string): LegacyMigrationPreview {
    const path = this.validateSourcePath(sourcePath);
    const sourceIdentity = this.sourceIdentity(path);
    const legacy = new DatabaseSync(path, { readOnly: true });
    const target = new DatabaseSync(this.catalogPath, { readOnly: true });
    try {
      this.assertSupportedLegacyDatabase(legacy);
      const targetProjects = target
        .prepare('SELECT id, name, reference_date FROM projects')
        .all() as Row[];
      const usedNames = new Set(
        targetProjects.map((row) => normalizedProjectName(stringValue(row['name']))),
      );
      const projects = (
        legacy
          .prepare(
            'SELECT id, name, reference_date, created_at, updated_at FROM projects ORDER BY created_at, id',
          )
          .all() as Row[]
      ).map((project): LegacyMigrationProjectPreview => {
        const legacyProjectId = stringValue(project['id']);
        const name = stringValue(project['name']);
        const referenceDate = stringValue(project['reference_date']);
        const exact = targetProjects.find(
          (candidate) =>
            normalizedProjectName(stringValue(candidate['name'])) === normalizedProjectName(name) &&
            stringValue(candidate['reference_date']) === referenceDate,
        );
        const targetName = exact
          ? stringValue(exact['name'])
          : this.uniqueImportedName(name, usedNames);
        usedNames.add(normalizedProjectName(targetName));
        return {
          legacyProjectId,
          name,
          referenceDate,
          action: exact ? 'merge' : 'create',
          ...(exact ? { targetProjectId: stringValue(exact['id']) } : {}),
          targetName,
          counts: this.projectCounts(legacy, legacyProjectId),
        };
      });
      return {
        sourcePath: path,
        sourceIdentity,
        alreadyMigrated: this.wasMigrated(target, sourceIdentity),
        projects,
        totals: projects.reduce(
          (total, project) => addCounts(total, project.counts),
          emptyCounts(),
        ),
      };
    } finally {
      closeDatabase(legacy);
      closeDatabase(target);
    }
  }

  migrate(request: LegacyMigrationRequest): LegacyMigrationResult {
    const preview = this.preview(request.sourcePath);
    if (preview.sourceIdentity !== request.sourceIdentity)
      throw new Error('The legacy downloader database changed after it was previewed.');
    if (preview.alreadyMigrated)
      throw new Error('This legacy downloader database was already migrated.');

    const legacy = new DatabaseSync(preview.sourcePath, { readOnly: true });
    const target = new DatabaseSync(this.catalogPath);
    const createdProjectDirectories: string[] = [];
    target.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
    try {
      const projectMap = new Map<string, string>();
      for (const project of preview.projects) {
        const targetProjectId = project.targetProjectId ?? randomUUID();
        projectMap.set(project.legacyProjectId, targetProjectId);
        if (project.action === 'create') {
          const legacyProject = legacy
            .prepare('SELECT created_at, updated_at FROM projects WHERE id = ?')
            .get(project.legacyProjectId) as Row;
          target
            .prepare(
              `INSERT INTO projects(id, name, reference_date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(
              targetProjectId,
              project.targetName,
              project.referenceDate,
              stringValue(legacyProject['created_at']),
              stringValue(legacyProject['updated_at']),
            );
          const projectDirectory = join(this.projectsDirectory, targetProjectId);
          mkdirSync(projectDirectory, { recursive: true });
          createdProjectDirectories.push(projectDirectory);
        }
      }

      const customBadgeMap = this.copyBadges(legacy, target, 'custom_badges', 'custom_badges');
      const combinedBadgeMap = this.copyBadges(
        legacy,
        target,
        'combined_custom_badges',
        'combined_custom_badges',
      );
      const leagueMap = this.copySourceEntities(legacy, target, 'leagues', projectMap);
      const teamMap = this.copySourceEntities(legacy, target, 'teams', projectMap, {
        league_id: leagueMap,
      });
      const playerMap = this.copySourceEntities(legacy, target, 'players', projectMap, {
        team_id: teamMap,
      });

      this.copyAssignments(
        legacy,
        target,
        'league_custom_badges',
        'league_id',
        customBadgeMap,
        leagueMap,
      );
      this.copyAssignments(
        legacy,
        target,
        'team_custom_badges',
        'team_id',
        customBadgeMap,
        teamMap,
      );
      this.copyAssignments(
        legacy,
        target,
        'player_custom_badges',
        'player_id',
        customBadgeMap,
        playerMap,
      );

      const combinedLeagueMap = this.copyCombinedEntities(
        legacy,
        target,
        'combined_leagues',
        'combined_league_sources',
        'combined_league_id',
        'source_league_id',
        projectMap,
        leagueMap,
      );
      const combinedTeamMap = this.copyCombinedEntities(
        legacy,
        target,
        'combined_teams',
        'combined_team_sources',
        'combined_team_id',
        'source_team_id',
        projectMap,
        teamMap,
        { league_id: combinedLeagueMap },
      );
      const combinedPlayerMap = this.copyCombinedEntities(
        legacy,
        target,
        'combined_players',
        'combined_player_sources',
        'combined_player_id',
        'source_player_id',
        projectMap,
        playerMap,
        { team_id: combinedTeamMap },
      );

      this.copyCombinedSources(
        legacy,
        target,
        'combined_league_sources',
        'combined_league_id',
        'source_league_id',
        combinedLeagueMap,
        leagueMap,
      );
      this.copyCombinedSources(
        legacy,
        target,
        'combined_team_sources',
        'combined_team_id',
        'source_team_id',
        combinedTeamMap,
        teamMap,
      );
      this.copyCombinedSources(
        legacy,
        target,
        'combined_player_sources',
        'combined_player_id',
        'source_player_id',
        combinedPlayerMap,
        playerMap,
      );

      this.copyAssignments(
        legacy,
        target,
        'combined_league_custom_badges',
        'combined_league_id',
        combinedBadgeMap,
        combinedLeagueMap,
      );
      this.copyAssignments(
        legacy,
        target,
        'combined_team_custom_badges',
        'combined_team_id',
        combinedBadgeMap,
        combinedTeamMap,
      );
      this.copyAssignments(
        legacy,
        target,
        'combined_player_custom_badges',
        'combined_player_id',
        combinedBadgeMap,
        combinedPlayerMap,
      );

      const insertPreference = target.prepare(
        'INSERT OR IGNORE INTO application_preferences(key, value) VALUES (?, ?)',
      );
      for (const row of legacy
        .prepare('SELECT key, value FROM application_preferences')
        .all() as Row[])
        insertPreference.run(row['key'] ?? '', row['value'] ?? '');

      const now = new Date().toISOString();
      for (const projectId of new Set(projectMap.values()))
        target.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
      target
        .prepare('INSERT INTO settings(key, value) VALUES (?, ?)')
        .run(this.migrationSettingKey(preview.sourceIdentity), now);
      target.exec('COMMIT');
      return {
        sourceIdentity: preview.sourceIdentity,
        projectsMerged: preview.projects.filter(({ action }) => action === 'merge').length,
        projectsCreated: preview.projects.filter(({ action }) => action === 'create').length,
        totals: preview.totals,
      };
    } catch (error) {
      try {
        target.exec('ROLLBACK');
      } catch {
        // Preserve the original migration error.
      }
      for (const directory of createdProjectDirectories)
        if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
      throw error;
    } finally {
      closeDatabase(legacy);
      closeDatabase(target);
    }
  }

  private copySourceEntities(
    legacy: DatabaseSync,
    target: DatabaseSync,
    table: 'leagues' | 'teams' | 'players',
    projectMap: ReadonlyMap<string, string>,
    foreignMaps: Readonly<Record<string, ReadonlyMap<string, string>>> = {},
  ): Map<string, string> {
    const result = new Map<string, string>();
    for (const row of legacy
      .prepare(`SELECT * FROM ${quote(table)} ORDER BY rowid`)
      .all() as Row[]) {
      const legacyId = stringValue(row['id']);
      const projectId = projectMap.get(stringValue(row['project_id']));
      if (!projectId) continue;
      const sourceName = stringValue(row['source_name']);
      const sourceId = stringValue(row['source_id']);
      const season = stringValue(row['season']);
      const existing =
        table === 'players'
          ? (target
              .prepare(
                `SELECT id FROM players
                 WHERE project_id = ? AND team_id = ? AND source_name = ? AND source_id = ?
                 LIMIT 1`,
              )
              .get(
                projectId,
                foreignMaps['team_id']?.get(stringValue(row['team_id'])) ?? '',
                sourceName,
                sourceId,
              ) as Row | undefined)
          : (target
              .prepare(
                `SELECT id FROM ${quote(table)}
                 WHERE project_id = ? AND source_name = ? AND source_id = ? AND season = ?
                 LIMIT 1`,
              )
              .get(projectId, sourceName, sourceId, season) as Row | undefined);
      if (existing) {
        result.set(legacyId, stringValue(existing['id']));
        continue;
      }
      const targetId = this.availableId(target, table, legacyId);
      const overrides: Row = { id: targetId, project_id: projectId };
      for (const [column, map] of Object.entries(foreignMaps)) {
        const legacyForeignId = stringValue(row[column]);
        overrides[column] = map.get(legacyForeignId) ?? null;
      }
      this.insertRow(target, table, row, overrides);
      result.set(legacyId, targetId);
    }
    return result;
  }

  private copyCombinedEntities(
    legacy: DatabaseSync,
    target: DatabaseSync,
    table: 'combined_leagues' | 'combined_teams' | 'combined_players',
    sourceTable: 'combined_league_sources' | 'combined_team_sources' | 'combined_player_sources',
    combinedIdColumn: string,
    sourceIdColumn: string,
    projectMap: ReadonlyMap<string, string>,
    sourceMap: ReadonlyMap<string, string>,
    foreignMaps: Readonly<Record<string, ReadonlyMap<string, string>>> = {},
  ): Map<string, string> {
    const result = new Map<string, string>();
    for (const row of legacy
      .prepare(`SELECT * FROM ${quote(table)} ORDER BY rowid`)
      .all() as Row[]) {
      const legacyId = stringValue(row['id']);
      const projectId = projectMap.get(stringValue(row['project_id']));
      if (!projectId) continue;
      const sourceRows = legacy
        .prepare(
          `SELECT ${quote(sourceIdColumn)} AS source_id
           FROM ${quote(sourceTable)}
           WHERE ${quote(combinedIdColumn)} = ?`,
        )
        .all(legacyId) as Row[];
      let existingCombinedId = '';
      for (const sourceRow of sourceRows) {
        const mappedSourceId = sourceMap.get(stringValue(sourceRow['source_id']));
        if (!mappedSourceId) continue;
        const existing = target
          .prepare(
            `SELECT ${quote(combinedIdColumn)} AS combined_id
             FROM ${quote(sourceTable)}
             WHERE ${quote(sourceIdColumn)} = ?
             LIMIT 1`,
          )
          .get(mappedSourceId) as Row | undefined;
        if (existing) {
          existingCombinedId = stringValue(existing['combined_id']);
          break;
        }
      }
      if (existingCombinedId) {
        result.set(legacyId, existingCombinedId);
        continue;
      }
      const targetId = this.availableId(target, table, legacyId);
      const overrides: Row = { id: targetId, project_id: projectId };
      for (const [column, map] of Object.entries(foreignMaps)) {
        const legacyForeignId = stringValue(row[column]);
        overrides[column] = map.get(legacyForeignId) ?? null;
      }
      this.insertRow(target, table, row, overrides);
      result.set(legacyId, targetId);
    }
    return result;
  }

  private copyCombinedSources(
    legacy: DatabaseSync,
    target: DatabaseSync,
    table: 'combined_league_sources' | 'combined_team_sources' | 'combined_player_sources',
    combinedIdColumn: string,
    sourceIdColumn: string,
    combinedMap: ReadonlyMap<string, string>,
    sourceMap: ReadonlyMap<string, string>,
  ): void {
    for (const row of legacy
      .prepare(`SELECT * FROM ${quote(table)} ORDER BY rowid`)
      .all() as Row[]) {
      const combinedId = combinedMap.get(stringValue(row[combinedIdColumn]));
      if (!combinedId) continue;
      const legacySourceId = row[sourceIdColumn];
      const sourceId =
        legacySourceId === null ? null : (sourceMap.get(stringValue(legacySourceId)) ?? null);
      this.insertRow(
        target,
        table,
        row,
        {
          id: this.availableId(target, table, stringValue(row['id'])),
          [combinedIdColumn]: combinedId,
          [sourceIdColumn]: sourceId,
        },
        true,
      );
    }
  }

  private copyBadges(
    legacy: DatabaseSync,
    target: DatabaseSync,
    legacyTable: 'custom_badges' | 'combined_custom_badges',
    targetTable: 'custom_badges' | 'combined_custom_badges',
  ): Map<string, string> {
    const result = new Map<string, string>();
    for (const row of legacy
      .prepare(`SELECT * FROM ${quote(legacyTable)} ORDER BY rowid`)
      .all() as Row[]) {
      const legacyId = stringValue(row['id']);
      const existing = target
        .prepare(`SELECT id FROM ${quote(targetTable)} WHERE name = ? COLLATE NOCASE LIMIT 1`)
        .get(row['name'] ?? '') as Row | undefined;
      if (existing) {
        result.set(legacyId, stringValue(existing['id']));
        continue;
      }
      const targetId = this.availableId(target, targetTable, legacyId);
      this.insertRow(target, targetTable, row, { id: targetId });
      result.set(legacyId, targetId);
    }
    return result;
  }

  private copyAssignments(
    legacy: DatabaseSync,
    target: DatabaseSync,
    table:
      | 'league_custom_badges'
      | 'team_custom_badges'
      | 'player_custom_badges'
      | 'combined_league_custom_badges'
      | 'combined_team_custom_badges'
      | 'combined_player_custom_badges',
    entityColumn: string,
    badgeMap: ReadonlyMap<string, string>,
    entityMap: ReadonlyMap<string, string>,
  ): void {
    for (const row of legacy.prepare(`SELECT * FROM ${quote(table)}`).all() as Row[]) {
      const badgeId = badgeMap.get(stringValue(row['badge_id']));
      const entityId = entityMap.get(stringValue(row[entityColumn]));
      if (!badgeId || !entityId) continue;
      this.insertRow(target, table, row, { badge_id: badgeId, [entityColumn]: entityId }, true);
    }
  }

  private insertRow(
    database: DatabaseSync,
    table: string,
    source: Row,
    overrides: Row,
    ignoreConflicts = false,
  ): void {
    const row = { ...source, ...overrides };
    const columns = Object.keys(row);
    const verb = ignoreConflicts ? 'INSERT OR IGNORE' : 'INSERT';
    database
      .prepare(
        `${verb} INTO ${quote(table)} (${columns.map(quote).join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .run(...columns.map((column) => row[column] ?? null));
  }

  private availableId(database: DatabaseSync, table: string, preferred: string): string {
    const collision = database.prepare(`SELECT 1 FROM ${quote(table)} WHERE id = ?`).get(preferred);
    return collision ? randomUUID() : preferred;
  }

  private projectCounts(database: DatabaseSync, projectId: string): LegacyMigrationCounts {
    const count = (table: string): number =>
      Number(
        (
          database
            .prepare(`SELECT count(*) AS count FROM ${quote(table)} WHERE project_id = ?`)
            .get(projectId) as Row
        )['count'] ?? 0,
      );
    return {
      leagues: count('leagues'),
      teams: count('teams'),
      players: count('players'),
      combinedLeagues: count('combined_leagues'),
      combinedTeams: count('combined_teams'),
      combinedPlayers: count('combined_players'),
    };
  }

  private assertSupportedLegacyDatabase(database: DatabaseSync): void {
    const tables = new Set(
      (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Row[]).map(
        (row) => stringValue(row['name']),
      ),
    );
    const missing = requiredLegacyTables.filter((table) => !tables.has(table));
    if (missing.length)
      throw new Error(`The selected file is not a supported QDB Downloader database.`);
    const version = Number(
      (
        database
          .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
          .get() as Row
      )['version'] ?? 0,
    );
    if (version !== 13)
      throw new Error(`QDB Downloader schema version ${version} is not supported; expected 13.`);
  }

  private uniqueImportedName(name: string, usedNames: ReadonlySet<string>): string {
    const base = `${name.trim()} (Downloader)`;
    if (!usedNames.has(normalizedProjectName(base))) return base;
    let suffix = 2;
    while (usedNames.has(normalizedProjectName(`${base} ${suffix}`))) suffix += 1;
    return `${base} ${suffix}`;
  }

  private validateSourcePath(sourcePath: string): string {
    const path = resolve(sourcePath);
    if (path === resolve(this.catalogPath))
      throw new Error('Choose the database from the standalone QDB Downloader application.');
    if (!existsSync(path) || !statSync(path).isFile())
      throw new Error('The legacy QDB Downloader database was not found.');
    return path;
  }

  private sourceIdentity(path: string): string {
    const stat = statSync(path);
    return createHash('sha256').update(`${path}\0${stat.size}\0${stat.mtimeMs}`).digest('hex');
  }

  private migrationSettingKey(sourceIdentity: string): string {
    return `legacy_downloader_migration:${sourceIdentity}`;
  }

  private wasMigrated(database: DatabaseSync, sourceIdentity: string): boolean {
    return Boolean(
      database
        .prepare('SELECT 1 FROM settings WHERE key = ?')
        .get(this.migrationSettingKey(sourceIdentity)),
    );
  }
}
