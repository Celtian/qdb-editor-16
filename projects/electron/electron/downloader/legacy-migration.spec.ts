import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Catalog } from '../catalog.js';
import { createBlankDatabase } from '../database-importer.js';
import { closeDatabase, DatabaseSync } from '../runtime-sqlite.js';
import { SnapshotDatabase } from './database.js';
import { LegacyDownloaderMigration } from './legacy-migration.js';

const roots: string[] = [];

const temporaryRoot = (name: string): string => {
  const root = mkdtempSync(join(tmpdir(), name));
  roots.push(root);
  return root;
};

const mergeOperation = () =>
  ({
    kind: 'merge',
    options: {
      existingRecords: 'refresh',
      teamLeagueConflicts: 'move',
      playerTeamConflicts: 'move',
    },
  }) as const;

const seedProject = (
  database: SnapshotDatabase,
  name: string,
  referenceDate: string,
  suffix: string,
) => {
  const project = database.createProject({ name, referenceDate });
  database.commitImport({
    projectId: project.id,
    sourceName: 'transfermarkt',
    operation: mergeOperation(),
    league: {
      sourceId: `league-${suffix}`,
      name: `${name} League`,
      sourceUrl: `https://example.test/leagues/${suffix}`,
    },
    teams: [
      {
        sourceId: `team-${suffix}`,
        name: `${name} Team`,
        sourceUrl: `https://example.test/teams/${suffix}`,
        players: [{ sourceId: `player-${suffix}`, name: `${name} Player` }],
      },
    ],
  });
  return project;
};

const fileHash = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('LegacyDownloaderMigration', () => {
  it('rejects corrupt and unsupported legacy databases without touching the catalog', () => {
    const targetRoot = temporaryRoot('qdb-editor-legacy-invalid-target-');
    const catalog = new Catalog(targetRoot);
    catalog.close();
    const migration = new LegacyDownloaderMigration(
      join(targetRoot, 'catalog.sqlite'),
      join(targetRoot, 'projects'),
    );

    const corruptPath = join(targetRoot, 'corrupt.sqlite');
    writeFileSync(corruptPath, 'not a sqlite database');
    expect(() => migration.preview(corruptPath)).toThrow();

    const unsupportedPath = join(targetRoot, 'unsupported.sqlite');
    const unsupported = new DatabaseSync(unsupportedPath);
    unsupported.exec('CREATE TABLE projects (id TEXT PRIMARY KEY)');
    closeDatabase(unsupported);
    expect(() => migration.preview(unsupportedPath)).toThrow(
      'not a supported QDB Downloader database',
    );

    const inspected = new DatabaseSync(join(targetRoot, 'catalog.sqlite'), {
      readOnly: true,
    });
    expect(inspected.prepare('SELECT count(*) AS count FROM projects').get()).toMatchObject({
      count: 0,
    });
    closeDatabase(inspected);
  });

  it('previews exact merges, imports conflicting projects and preserves FIFA databases', () => {
    const legacyRoot = temporaryRoot('qdb-editor-legacy-source-');
    const legacyPath = join(legacyRoot, 'qdb-downloader.sqlite');
    const legacy = new SnapshotDatabase(legacyPath);
    const mergedLegacyProject = seedProject(legacy, 'Career', '2026-07-01', 'merge');
    seedProject(legacy, 'Conflict', '2025-07-01', 'conflict');
    legacy.setExportDestination('/legacy/exports');

    const candidates = legacy.listCombineTeamCandidates({
      projectId: mergedLegacyProject.id,
      search: '',
    });
    const combination = legacy.previewTeamCombination({
      projectId: mergedLegacyProject.id,
      sourceTeamIds: candidates.map(({ id }) => id),
    });
    legacy.commitTeamCombination({
      projectId: mergedLegacyProject.id,
      sourceTeamIds: candidates.map(({ id }) => id),
      league: {
        kind: 'create',
        sourceLeagueIds: combination.sourceLeagues.map(({ id }) => id),
        resolutions: {},
      },
      matchGroups: combination.matchGroups,
      selectedPlayerGroupIds: combination.matchGroups.map(({ id }) => id),
      teamResolutions: {},
      playerResolutions: {},
    });
    const sourceBadge = legacy.createCustomBadge({
      name: 'Review',
      description: 'Needs a source review',
      color: 'red',
    });
    const sourcePlayer = legacy.listEntities({
      projectId: mergedLegacyProject.id,
      entity: 'players',
      pageIndex: 0,
      pageSize: 10,
      search: '',
      sort: 'name',
      direction: 'asc',
    }).rows[0];
    if (!sourcePlayer) throw new Error('Expected the legacy source player fixture.');
    legacy.updateEntityCustomBadges({
      projectId: mergedLegacyProject.id,
      entity: 'players',
      ids: [sourcePlayer.id],
      addBadgeIds: [sourceBadge.id],
      removeBadgeIds: [],
    });
    legacy.close();
    const originalLegacyHash = fileHash(legacyPath);

    const targetRoot = temporaryRoot('qdb-editor-legacy-target-');
    let catalog = new Catalog(targetRoot);
    const mergedTargetProject = catalog.createProject({
      name: 'Career',
      referenceDate: '2026-07-01',
    });
    catalog.createProject({ name: 'Conflict', referenceDate: '2026-07-01' });
    const fifaDatabaseId = crypto.randomUUID();
    const temporaryDatabase = catalog.temporaryDatabasePath(mergedTargetProject.id, fifaDatabaseId);
    const blank = createBlankDatabase(
      fifaDatabaseId,
      mergedTargetProject.id,
      'Career FIFA',
      temporaryDatabase,
    );
    renameSync(
      temporaryDatabase,
      catalog.finalDatabasePath(mergedTargetProject.id, fifaDatabaseId),
    );
    catalog.createDatabaseRecord(
      fifaDatabaseId,
      mergedTargetProject.id,
      'Career FIFA',
      blank.source,
      0,
      blank.report,
    );
    catalog.close();

    const targetPath = join(targetRoot, 'catalog.sqlite');
    const snapshot = new SnapshotDatabase(targetPath);
    snapshot.close();
    const migration = new LegacyDownloaderMigration(targetPath, join(targetRoot, 'projects'));
    const preview = migration.preview(legacyPath);

    expect(preview.alreadyMigrated).toBe(false);
    expect(preview.projects).toEqual([
      expect.objectContaining({
        name: 'Career',
        action: 'merge',
        targetProjectId: mergedTargetProject.id,
      }),
      expect.objectContaining({
        name: 'Conflict',
        action: 'create',
        targetName: 'Conflict (Downloader)',
      }),
    ]);
    expect(preview.totals).toMatchObject({
      leagues: 2,
      teams: 2,
      players: 2,
      combinedLeagues: 1,
      combinedTeams: 1,
      combinedPlayers: 1,
    });

    expect(
      migration.migrate({
        sourcePath: legacyPath,
        sourceIdentity: preview.sourceIdentity,
      }),
    ).toMatchObject({ projectsMerged: 1, projectsCreated: 1, totals: preview.totals });
    expect(fileHash(legacyPath)).toBe(originalLegacyHash);
    expect(migration.preview(legacyPath).alreadyMigrated).toBe(true);

    catalog = new Catalog(targetRoot);
    const projects = catalog.listProjects();
    expect(projects.find(({ id }) => id === mergedTargetProject.id)).toMatchObject({
      databaseCount: 1,
      sourceLeagueCount: 1,
      sourceTeamCount: 1,
      sourcePlayerCount: 1,
      combinedLeagueCount: 1,
      combinedTeamCount: 1,
      combinedPlayerCount: 1,
      sourceNames: ['transfermarkt'],
    });
    expect(projects).toContainEqual(
      expect.objectContaining({
        name: 'Conflict (Downloader)',
        sourceLeagueCount: 1,
        sourceTeamCount: 1,
        sourcePlayerCount: 1,
      }),
    );
    expect(catalog.listDatabases(mergedTargetProject.id)).toHaveLength(1);
    catalog.close();

    const integrated = new SnapshotDatabase(targetPath);
    expect(integrated.getExportDestination()).toBe('/legacy/exports');
    expect(integrated.listCustomBadges()).toEqual([
      expect.objectContaining({ name: 'Review', assignmentCount: 1 }),
    ]);
    integrated.close();
  });

  it('rolls back all catalog changes on failure and permits a retry', () => {
    const legacyRoot = temporaryRoot('qdb-editor-legacy-rollback-source-');
    const legacyPath = join(legacyRoot, 'qdb-downloader.sqlite');
    const legacy = new SnapshotDatabase(legacyPath);
    seedProject(legacy, 'Retry', '2026-01-01', 'retry');
    legacy.close();

    const targetRoot = temporaryRoot('qdb-editor-legacy-rollback-target-');
    const catalog = new Catalog(targetRoot);
    catalog.close();
    const targetPath = join(targetRoot, 'catalog.sqlite');
    const snapshot = new SnapshotDatabase(targetPath);
    snapshot.close();
    const migration = new LegacyDownloaderMigration(targetPath, join(targetRoot, 'projects'));
    const preview = migration.preview(legacyPath);
    const raw = new DatabaseSync(targetPath);
    raw.exec(`
      CREATE TRIGGER reject_legacy_leagues
      BEFORE INSERT ON leagues
      BEGIN
        SELECT RAISE(ABORT, 'forced migration failure');
      END;
    `);
    closeDatabase(raw);

    expect(() =>
      migration.migrate({
        sourcePath: legacyPath,
        sourceIdentity: preview.sourceIdentity,
      }),
    ).toThrow('forced migration failure');

    let inspected = new DatabaseSync(targetPath, { readOnly: true });
    expect(inspected.prepare('SELECT count(*) AS count FROM projects').get()).toMatchObject({
      count: 0,
    });
    expect(inspected.prepare('SELECT count(*) AS count FROM leagues').get()).toMatchObject({
      count: 0,
    });
    closeDatabase(inspected);

    inspected = new DatabaseSync(targetPath);
    inspected.exec('DROP TRIGGER reject_legacy_leagues');
    closeDatabase(inspected);
    expect(
      migration.migrate({
        sourcePath: legacyPath,
        sourceIdentity: preview.sourceIdentity,
      }),
    ).toMatchObject({ projectsCreated: 1 });
  });
});
