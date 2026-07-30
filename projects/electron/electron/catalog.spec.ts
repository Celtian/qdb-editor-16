import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Catalog } from './catalog';
import { createBlankDatabase } from './database-importer';

const roots: string[] = [];

const createCatalog = (): Catalog => {
  const root = mkdtempSync(join(tmpdir(), 'qdb-editor-catalog-'));
  roots.push(root);
  return new Catalog(root);
};

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Catalog', () => {
  it('creates, updates, and removes projects with case-insensitive unique names', () => {
    const catalog = createCatalog();
    const project = catalog.createProject({ name: 'Season', referenceDate: '2016-06-30' });

    expect(catalog.listProjects()).toEqual([expect.objectContaining({ name: 'Season' })]);
    expect(() => catalog.createProject({ name: 'season', referenceDate: '2016-01-01' })).toThrow(
      /already exists/,
    );
    expect(() =>
      catalog.createProject({ name: 'Invalid date', referenceDate: '2016-02-31' }),
    ).toThrow(/reference date/i);
    expect(
      catalog.updateProject({ id: project.id, name: 'Career', referenceDate: '2016-07-01' }),
    ).toEqual(expect.objectContaining({ name: 'Career', referenceDate: '2016-07-01' }));
    expect(catalog.removeProject(project.id)).toEqual({
      projectId: project.id,
      removed: true,
      databasesRemoved: 0,
    });
    expect(catalog.listProjects()).toEqual([]);
    catalog.close();
  });

  it('tracks a managed blank database and theme preference', () => {
    const catalog = createCatalog();
    const project = catalog.createProject({ name: 'Project', referenceDate: '2016-01-01' });
    const id = crypto.randomUUID();
    const temporary = catalog.temporaryDatabasePath(project.id, id);
    const created = createBlankDatabase(id, project.id, 'Blank', temporary);
    renameSync(temporary, catalog.finalDatabasePath(project.id, id));
    const descriptor = catalog.createDatabaseRecord(
      id,
      project.id,
      'Blank',
      created.source,
      0,
      created.report,
    );

    expect(descriptor.tableCount).toBe(25);
    expect(() => catalog.assertDatabaseNameAvailable(project.id, 'blank')).toThrow(
      /already exists/i,
    );
    expect(catalog.listProjects()[0]?.databaseCount).toBe(1);
    expect(catalog.setTheme('dark')).toBe('dark');
    expect(catalog.getTheme()).toBe('dark');
    expect(catalog.removeDatabase(id)).toBe(true);
    catalog.close();
  });

  it('removes interrupted import sidecars and staged deletion directories on startup', () => {
    const root = mkdtempSync(join(tmpdir(), 'qdb-editor-catalog-cleanup-'));
    roots.push(root);
    const projects = join(root, 'projects');
    const project = join(projects, crypto.randomUUID());
    const stagedDirectory = join(projects, `${crypto.randomUUID()}.deleting-test`);
    mkdirSync(project, { recursive: true });
    mkdirSync(stagedDirectory);
    const temporary = join(project, `${crypto.randomUUID()}.importing`);
    for (const suffix of ['', '-wal', '-shm']) writeFileSync(`${temporary}${suffix}`, 'staged');

    const catalog = new Catalog(root);
    expect(existsSync(stagedDirectory)).toBe(false);
    for (const suffix of ['', '-wal', '-shm'])
      expect(existsSync(`${temporary}${suffix}`)).toBe(false);
    catalog.close();
  });
});
