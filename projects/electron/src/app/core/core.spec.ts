import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import type {
  DatabaseDescriptor,
  OperationProgress,
  ProjectDescriptor,
  QdbEditorApi,
  TableDescriptor,
  ValidationReport,
} from '../../../shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from './app-store';
import { DesktopApi } from './desktop-api';
import { Theme } from './theme';

const project: ProjectDescriptor = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Career',
  referenceDate: '2015-08-01',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  databaseCount: 1,
};

const report: ValidationReport = {
  databaseId: '22222222-2222-4222-8222-222222222222',
  validatedAt: '2026-07-30T00:00:00.000Z',
  tablesChecked: 25,
  rowsChecked: 0,
  errorCount: 0,
  warningCount: 0,
  issues: [],
};

const database: DatabaseDescriptor = {
  id: report.databaseId,
  projectId: project.id,
  name: 'Main',
  fifaVersion: 16,
  source: {
    kind: 'blank',
    originalPaths: [],
    hashes: {},
    importedAt: report.validatedAt,
  },
  status: 'available',
  tableCount: 25,
  rowCount: 0,
  createdAt: report.validatedAt,
  updatedAt: report.validatedAt,
  validation: report,
};

const table: TableDescriptor = {
  name: 'players',
  fields: [],
  rowCount: 0,
  errorCount: 0,
  warningCount: 0,
};

const makeApi = (): QdbEditorApi => ({
  listProjects: vi.fn(async () => [project]),
  createProject: vi.fn(async () => project),
  updateProject: vi.fn(async () => project),
  removeProject: vi.fn(async () => ({
    projectId: project.id,
    removed: true,
    databasesRemoved: 1,
  })),
  listDatabases: vi.fn(async () => [database]),
  createBlankDatabase: vi.fn(async () => database),
  renameDatabase: vi.fn(async () => database),
  removeDatabase: vi.fn(async () => true),
  selectTextSource: vi.fn(async () => undefined),
  selectT3dbDatabaseFile: vi.fn(async () => undefined),
  selectT3dbMetadataFile: vi.fn(async () => undefined),
  prepareT3dbSource: vi.fn(async () => ({
    selectionId: 'selection',
    suggestedName: 'Main',
    sourceKind: 't3db' as const,
    originalPaths: [],
    tables: [],
    unsupportedTables: [],
    warnings: [],
  })),
  importDatabase: vi.fn(async () => ({ database, validation: report })),
  listTables: vi.fn(async () => [table]),
  readTable: vi.fn(async () => ({ table: 'players', fields: [], rows: [], total: 0 })),
  readRow: vi.fn(async () => ({ rowId: 1, rowOrder: 0, values: {} })),
  saveRow: vi.fn(async () => ({
    row: { rowId: 1, rowOrder: 0, values: {} },
    warnings: [],
  })),
  deleteRow: vi.fn(async () => true),
  validateDatabase: vi.fn(async () => report),
  getValidation: vi.fn(async () => report),
  selectExportDirectory: vi.fn(async () => undefined),
  exportDatabase: vi.fn(async () => ({
    databaseId: database.id,
    outputPath: 'C:\\export',
  })),
  revealExport: vi.fn(async () => true),
  cancelOperation: vi.fn(async () => true),
  getTheme: vi.fn(async () => 'system' as const),
  setTheme: vi.fn(async (value) => value),
  onProgress: vi.fn(() => () => undefined),
});

describe('DesktopApi', () => {
  let api: QdbEditorApi;
  let desktop: DesktopApi;

  beforeEach(() => {
    api = makeApi();
    window.qdbEditor = api;
    TestBed.configureTestingModule({ providers: [DesktopApi] });
    desktop = TestBed.inject(DesktopApi);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    delete window.qdbEditor;
  });

  it('delegates the complete serializable preload contract', async () => {
    await desktop.listProjects();
    await desktop.createProject({ name: 'Career', referenceDate: '2015-08-01' });
    await desktop.updateProject({ id: project.id, name: 'Career', referenceDate: '2015-08-01' });
    await desktop.removeProject(project.id);
    await desktop.listDatabases(project.id);
    await desktop.createBlankDatabase({ projectId: project.id, name: 'Main' });
    await desktop.renameDatabase(database.id, 'Renamed');
    await desktop.removeDatabase(database.id);
    await desktop.selectTextSource();
    await desktop.selectT3dbDatabaseFile();
    await desktop.selectT3dbMetadataFile();
    await desktop.prepareT3dbSource({ databaseFileId: 'db', metadataFileId: 'xml' });
    await desktop.importDatabase({
      projectId: project.id,
      selectionId: 'selection',
      name: 'Main',
    });
    await desktop.listTables(database.id);
    await desktop.readTable({
      databaseId: database.id,
      table: 'players',
      pageIndex: 0,
      pageSize: 25,
      query: '',
    });
    await desktop.readRow(database.id, 'players', 1);
    await desktop.saveRow({
      databaseId: database.id,
      table: 'players',
      values: {},
      acceptWarnings: false,
    });
    await desktop.deleteRow({ databaseId: database.id, table: 'players', rowId: 1 });
    await desktop.validateDatabase(database.id);
    await desktop.getValidation(database.id);
    await desktop.selectExportDirectory();
    await desktop.exportDatabase({ databaseId: database.id, targetParentPath: 'C:\\' });
    await desktop.revealExport('C:\\export');
    await desktop.cancelOperation('export');
    await desktop.getTheme();
    await desktop.setTheme('dark');
    desktop.onProgress(() => undefined);

    expect(api.listProjects).toHaveBeenCalledOnce();
    expect(api.saveRow).toHaveBeenCalledWith(
      expect.objectContaining({ databaseId: database.id, table: 'players' }),
    );
    expect(api.setTheme).toHaveBeenCalledWith('dark');
    expect(api.cancelOperation).toHaveBeenCalledWith('export');
  });

  it('rejects use outside the Electron bridge', () => {
    delete window.qdbEditor;
    expect(() => desktop.listProjects()).toThrow(/desktop bridge is unavailable/i);
  });
});

describe('AppStore', () => {
  it('loads context, receives progress, and exposes operation errors', async () => {
    let progressListener: ((value: OperationProgress) => void) | undefined;
    const api = makeApi();
    api.onProgress = vi.fn((listener) => {
      progressListener = listener;
      return () => undefined;
    });
    TestBed.configureTestingModule({
      providers: [AppStore, { provide: DesktopApi, useValue: api }],
    });
    const store = TestBed.inject(AppStore);

    await store.refreshProjects();
    await store.refreshDatabases(project.id);
    await store.refreshTables(database.id);
    progressListener?.({ operation: 'import', message: 'Importing players' });

    expect(store.activeProject()?.name).toBe('Career');
    expect(store.activeDatabase()?.name).toBe('Main');
    expect(store.tables()).toEqual([table]);
    expect(store.progress()?.message).toContain('players');
    await store.cancelCurrentOperation();
    expect(api.cancelOperation).toHaveBeenCalledWith('import');

    await expect(
      store.operation(async () => {
        throw new Error('Expected failure');
      }),
    ).rejects.toThrow('Expected failure');
    expect(store.loading()).toBe(false);
    expect(store.error()).toBe('Expected failure');
    store.clearError();
    expect(store.error()).toBe('');

    store.selectContext(project.id, database.id);
    expect(store.activeProjectId()).toBe(project.id);
  });
});

describe('Theme', () => {
  it('applies system and explicit themes to the document root', async () => {
    const api = makeApi();
    api.getTheme = vi.fn(async () => 'dark' as const);
    TestBed.configureTestingModule({
      providers: [Theme, { provide: DesktopApi, useValue: api }],
    });
    const theme = TestBed.inject(Theme);
    const document = TestBed.inject(DOCUMENT);

    await theme.initialize();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    await theme.set('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('falls back to the system theme when loading fails', async () => {
    const api = makeApi();
    api.getTheme = vi.fn(async () => {
      throw new Error('Unavailable');
    });
    TestBed.configureTestingModule({
      providers: [Theme, { provide: DesktopApi, useValue: api }],
    });
    const theme = TestBed.inject(Theme);

    await theme.initialize();
    expect(theme.preference()).toBe('system');
  });
});
