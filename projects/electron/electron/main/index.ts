import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type OpenDialogOptions,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { updateElectronApp } from 'update-electron-app';
import type {
  CreateBlankDatabaseRequest,
  CreateProjectRequest,
  DatabaseObjectSettings,
  DatabaseDescriptor,
  DeleteRowRequest,
  ExportDatabaseRequest,
  ImportDatabaseRequest,
  ImportDatabaseResult,
  OperationKind,
  OperationProgress,
  ObjectDeleteRequest,
  ObjectKind,
  ObjectListRequest,
  ObjectReadRequest,
  ObjectSection,
  PrepareT3dbRequest,
  SaveObjectRequest,
  SaveRowRequest,
  SourceFileSelection,
  TablePageRequest,
  ThemePreference,
  UpdateProjectRequest,
  ValidationReport,
} from '../../shared/contracts';
import { tableForName } from '../../shared/table-config';
import { Catalog, validateId } from '../catalog';
import { createBlankDatabase, type ImportedDatabase } from '../database-importer';
import { SnapshotDatabase } from '../downloader/database';
import { SnapshotExporter } from '../downloader/exporter';
import { registerIpcHandlers as registerDownloaderHandlers } from '../downloader/ipc';
import { LegacyDownloaderMigration } from '../downloader/legacy-migration';
import { SoccerbotScraper } from '../downloader/scraper';
import { FifaDatabase } from '../fifa-database';
import { inspectT3dbSource, inspectTextSource } from '../source-inspection';
import { SourceSelections } from '../source-selections';

const selections = new SourceSelections();
const activeOperations = new Map<OperationKind, Int32Array>();
const downloaderExportDirectories = new Map<string, string>();
let catalog: Catalog;
let snapshotDatabase: SnapshotDatabase;
let legacyMigration: LegacyDownloaderMigration;

const progress = (operation: OperationProgress['operation'], message: string): void => {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('qdb-editor:progress', {
      operation,
      message,
    } satisfies OperationProgress);
};

const workerPath = (): string => join(__dirname, '..', 'operation-worker.js');

const runWorker = <T>(
  operation: OperationProgress['operation'],
  request: Record<string, unknown>,
): Promise<T> =>
  new Promise((resolvePromise, reject) => {
    if (activeOperations.has(operation)) {
      reject(new Error(`A ${operation} operation is already running.`));
      return;
    }
    const cancellation = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    activeOperations.set(operation, cancellation);
    const worker = new Worker(workerPath(), {
      workerData: { ...request, cancellationBuffer: cancellation.buffer },
    });
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      activeOperations.delete(operation);
      action();
    };
    worker.on(
      'message',
      (message: { type: string; message?: string; result?: T; error?: string }) => {
        if (message.type === 'progress' && message.message) progress(operation, message.message);
        if (message.type === 'result') {
          finish(() => resolvePromise(message.result as T));
        }
        if (message.type === 'error') {
          finish(() => reject(new Error(message.error ?? 'The background operation failed.')));
        }
      },
    );
    worker.on('error', (error) => finish(() => reject(error)));
    worker.on('exit', (code) => {
      if (!settled)
        finish(() =>
          reject(
            new Error(
              code === 0
                ? 'The background operation ended without a result.'
                : `Background operation stopped with code ${code}.`,
            ),
          ),
        );
    });
  });

const removeTemporaryDatabase = (path: string): void => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
};

const validateRowId = (value: number): number => {
  const rowId = Number(value);
  if (!Number.isSafeInteger(rowId) || rowId < 1) throw new Error('Invalid row identifier.');
  return rowId;
};

const objectKinds: readonly ObjectKind[] = [
  'countries',
  'stadiums',
  'leagues',
  'teams',
  'players',
  'referees',
];
const objectSections: Record<ObjectKind, readonly ObjectSection[]> = {
  countries: ['root'],
  stadiums: ['root'],
  leagues: ['root', 'teams', 'referees'],
  teams: [
    'root',
    'identity',
    'traits',
    'tactics',
    'manager',
    'stadium',
    'location',
    'players',
    'jersey-numbers',
  ],
  players: ['identity', 'contract', 'appearance', 'gear', 'traits', 'skills', 'behaviour'],
  referees: ['root', 'identity', 'appearance', 'gear', 'leagues'],
};

const validateObjectKind = (value: ObjectKind): ObjectKind => {
  if (!objectKinds.includes(value)) throw new Error('Invalid object kind.');
  return value;
};

const validateObjectSection = (kind: ObjectKind, value: ObjectSection): ObjectSection => {
  if (!objectSections[kind].includes(value)) throw new Error(`Invalid ${kind} object section.`);
  return value;
};

const validateObjectId = (value: number): number => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('Invalid object identifier.');
  return id;
};

const withDatabase = <T>(databaseId: string, operation: (database: FifaDatabase) => T): T => {
  const descriptor = catalog.databaseDescriptor(validateId(databaseId));
  if (descriptor.status !== 'available')
    throw new Error(descriptor.error ?? 'Database is unavailable.');
  const database = new FifaDatabase(catalog.databasePath(databaseId));
  try {
    return operation(database);
  } finally {
    database.close();
  }
};

const installTemporaryDatabase = (
  projectId: string,
  databaseId: string,
  temporaryPath: string,
): string => {
  const finalPath = catalog.finalDatabasePath(projectId, databaseId);
  renameSync(temporaryPath, finalPath);
  for (const suffix of ['-wal', '-shm'])
    if (existsSync(`${temporaryPath}${suffix}`))
      renameSync(`${temporaryPath}${suffix}`, `${finalPath}${suffix}`);
  return finalPath;
};

const refreshSummary = async (databaseId: string): Promise<DatabaseDescriptor> => {
  const report = await runWorker<ValidationReport>('validation', {
    action: 'validate',
    databaseId,
    databasePath: catalog.databasePath(databaseId),
  });
  const rowCount = withDatabase(databaseId, (database) =>
    database.listTables().reduce((total, table) => total + table.rowCount, 0),
  );
  return catalog.updateDatabaseSummary(databaseId, rowCount, report);
};

const selectFile = async (
  kind: 'database' | 'metadata',
  options: OpenDialogOptions,
): Promise<SourceFileSelection | undefined> => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], ...options });
  const path = result.filePaths[0];
  return path ? selections.addFile(kind, path) : undefined;
};

const registerHandlers = (): void => {
  ipcMain.handle('qdb-editor:list-projects', () => catalog.listProjects());
  ipcMain.handle('qdb-editor:create-project', (_event, request: CreateProjectRequest) =>
    catalog.createProject(request),
  );
  ipcMain.handle('qdb-editor:update-project', (_event, request: UpdateProjectRequest) =>
    catalog.updateProject(request),
  );
  ipcMain.handle('qdb-editor:remove-project', async (_event, id: string) => {
    const projectId = validateId(id);
    const exportDirectories = [...downloaderExportDirectories.entries()].filter(
      ([, exportedProjectId]) => exportedProjectId === projectId,
    );
    const result = catalog.removeProject(projectId);
    let deletedExportCount = 0;
    const failedExportDirectories: string[] = [];
    for (const [directory] of exportDirectories) {
      try {
        await rm(directory, { recursive: true, force: true });
        downloaderExportDirectories.delete(directory);
        deletedExportCount += 1;
      } catch {
        failedExportDirectories.push(directory);
      }
    }
    return { ...result, deletedExportCount, failedExportDirectories };
  });
  ipcMain.handle('qdb-editor:list-databases', (_event, projectId: string) =>
    catalog.listDatabases(validateId(projectId)),
  );
  ipcMain.handle(
    'qdb-editor:create-blank-database',
    (_event, request: CreateBlankDatabaseRequest) => {
      const databaseId = randomUUID();
      const projectId = validateId(request.projectId);
      const name = catalog.assertDatabaseNameAvailable(projectId, request.name);
      const temporaryPath = catalog.temporaryDatabasePath(projectId, databaseId);
      const finalPath = catalog.finalDatabasePath(projectId, databaseId);
      try {
        const result = createBlankDatabase(databaseId, projectId, name, temporaryPath);
        installTemporaryDatabase(projectId, databaseId, temporaryPath);
        return catalog.createDatabaseRecord(
          databaseId,
          projectId,
          name,
          result.source,
          result.rowCount,
          result.report,
        );
      } catch (error) {
        removeTemporaryDatabase(temporaryPath);
        removeTemporaryDatabase(finalPath);
        throw error;
      }
    },
  );
  ipcMain.handle('qdb-editor:rename-database', (_event, id: string, name: string) => {
    const descriptor = catalog.renameDatabase(validateId(id), name);
    withDatabase(id, (database) => database.setMetadata('database_name', descriptor.name));
    return descriptor;
  });
  ipcMain.handle('qdb-editor:remove-database', (_event, id: string) =>
    catalog.removeDatabase(validateId(id)),
  );
  ipcMain.handle('qdb-editor:select-text-source', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select a FIFA 16 DB Master text folder',
      properties: ['openDirectory'],
    });
    const path = result.filePaths[0];
    return path ? selections.addSource(await inspectTextSource(path)) : undefined;
  });
  ipcMain.handle('qdb-editor:select-t3db-database', () =>
    selectFile('database', {
      title: 'Select FIFA 16 t3db database',
      filters: [{ name: 'FIFA database', extensions: ['db'] }],
    }),
  );
  ipcMain.handle('qdb-editor:select-t3db-metadata', () =>
    selectFile('metadata', {
      title: 'Select FIFA 16 t3db metadata',
      filters: [{ name: 'XML metadata', extensions: ['xml'] }],
    }),
  );
  ipcMain.handle('qdb-editor:prepare-t3db', async (_event, request: PrepareT3dbRequest) => {
    const [databasePath, metadataPath] = selections.resolvePair(
      validateId(request.databaseFileId),
      validateId(request.metadataFileId),
    );
    return selections.addSource(await inspectT3dbSource(databasePath, metadataPath));
  });
  ipcMain.handle(
    'qdb-editor:import-database',
    async (_event, request: ImportDatabaseRequest): Promise<ImportDatabaseResult> => {
      const databaseId = randomUUID();
      const projectId = validateId(request.projectId);
      const name = catalog.assertDatabaseNameAvailable(projectId, request.name);
      const source = selections.consume(validateId(request.selectionId));
      const temporaryPath = catalog.temporaryDatabasePath(projectId, databaseId);
      const finalPath = catalog.finalDatabasePath(projectId, databaseId);
      try {
        const imported = await runWorker<ImportedDatabase>('import', {
          action: 'import',
          databaseId,
          projectId,
          name,
          source,
          outputPath: temporaryPath,
        });
        installTemporaryDatabase(projectId, databaseId, temporaryPath);
        const database = catalog.createDatabaseRecord(
          databaseId,
          projectId,
          name,
          imported.source,
          imported.rowCount,
          imported.report,
        );
        return { database, validation: imported.report };
      } catch (error) {
        removeTemporaryDatabase(temporaryPath);
        removeTemporaryDatabase(finalPath);
        throw error;
      }
    },
  );
  ipcMain.handle('qdb-editor:list-tables', (_event, databaseId: string) =>
    withDatabase(validateId(databaseId), (database) => database.listTables()),
  );
  ipcMain.handle('qdb-editor:read-table', (_event, request: TablePageRequest) => {
    validateId(request.databaseId);
    tableForName(request.table);
    return withDatabase(request.databaseId, (database) => database.readTable(request));
  });
  ipcMain.handle(
    'qdb-editor:read-row',
    (_event, databaseId: string, table: string, rowId: number) =>
      withDatabase(validateId(databaseId), (database) =>
        database.readRow(tableForName(table), validateRowId(rowId)),
      ),
  );
  ipcMain.handle('qdb-editor:save-row', async (_event, request: SaveRowRequest) => {
    validateId(request.databaseId);
    tableForName(request.table);
    if (request.rowId !== undefined) validateRowId(request.rowId);
    const result = withDatabase(request.databaseId, (database) => database.saveRow(request));
    if (!result.warnings.length || request.acceptWarnings) await refreshSummary(request.databaseId);
    return result;
  });
  ipcMain.handle('qdb-editor:delete-row', async (_event, request: DeleteRowRequest) => {
    const removed = withDatabase(validateId(request.databaseId), (database) =>
      database.deleteRow(tableForName(request.table), validateRowId(request.rowId)),
    );
    if (removed) await refreshSummary(request.databaseId);
    return removed;
  });
  ipcMain.handle('qdb-editor:list-objects', (_event, request: ObjectListRequest) => {
    validateId(request.databaseId);
    validateObjectKind(request.kind);
    return withDatabase(request.databaseId, (database) => database.listObjects(request));
  });
  ipcMain.handle('qdb-editor:read-object', (_event, request: ObjectReadRequest) => {
    validateId(request.databaseId);
    const kind = validateObjectKind(request.kind);
    validateObjectSection(kind, request.section);
    validateObjectId(request.id);
    return withDatabase(request.databaseId, (database) => database.readObject(request));
  });
  ipcMain.handle('qdb-editor:save-object', async (_event, request: SaveObjectRequest) => {
    validateId(request.databaseId);
    const kind = validateObjectKind(request.kind);
    validateObjectSection(kind, request.section);
    if (request.id !== undefined) validateObjectId(request.id);
    const result = withDatabase(request.databaseId, (database) => database.saveObject(request));
    if (!result.warnings.length || request.acceptWarnings) await refreshSummary(request.databaseId);
    return result;
  });
  ipcMain.handle('qdb-editor:delete-object', async (_event, request: ObjectDeleteRequest) => {
    validateId(request.databaseId);
    validateObjectKind(request.kind);
    validateObjectId(request.id);
    const result = withDatabase(request.databaseId, (database) => database.deleteObject(request));
    if (result.deleted) await refreshSummary(request.databaseId);
    return result;
  });
  ipcMain.handle('qdb-editor:get-database-object-settings', (_event, databaseId: string) =>
    catalog.getDatabaseObjectSettings(validateId(databaseId)),
  );
  ipcMain.handle(
    'qdb-editor:save-database-object-settings',
    (_event, databaseId: string, settings: DatabaseObjectSettings) =>
      catalog.saveDatabaseObjectSettings(validateId(databaseId), settings),
  );
  ipcMain.handle('qdb-editor:restore-database-object-settings', (_event, databaseId: string) =>
    catalog.restoreDatabaseObjectSettings(validateId(databaseId)),
  );
  ipcMain.handle('qdb-editor:validate-database', async (_event, databaseId: string) => {
    const id = validateId(databaseId);
    await refreshSummary(id);
    return withDatabase(id, (database) => database.validationReport(id));
  });
  ipcMain.handle('qdb-editor:get-validation', (_event, databaseId: string) =>
    withDatabase(validateId(databaseId), (database) => database.validationReport(databaseId)),
  );
  ipcMain.handle('qdb-editor:select-export-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select export parent folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.filePaths[0];
  });
  ipcMain.handle('qdb-editor:export-database', async (_event, request: ExportDatabaseRequest) => {
    const descriptor = catalog.databaseDescriptor(validateId(request.databaseId));
    if (!isAbsolute(request.targetParentPath)) throw new Error('Select an absolute export path.');
    const outputPath = await runWorker<string>('export', {
      action: 'export',
      databasePath: catalog.databasePath(request.databaseId),
      databaseName: descriptor.name,
      targetParentPath: resolve(request.targetParentPath),
    });
    return { databaseId: request.databaseId, outputPath };
  });
  ipcMain.handle('qdb-editor:reveal-export', (_event, path: string) => {
    if (!isAbsolute(path)) throw new Error('Invalid export path.');
    shell.showItemInFolder(resolve(path));
    return true;
  });
  ipcMain.handle('qdb-editor:cancel-operation', (_event, operation: OperationKind) => {
    if (!['import', 'validation', 'export'].includes(operation))
      throw new Error('Invalid operation.');
    const cancellation = activeOperations.get(operation);
    if (!cancellation) return false;
    Atomics.store(cancellation, 0, 1);
    return true;
  });
  ipcMain.handle('qdb-editor:get-theme', () => catalog.getTheme());
  ipcMain.handle('qdb-editor:set-theme', (_event, theme: ThemePreference) => {
    const value = catalog.setTheme(theme);
    nativeTheme.themeSource = value;
    return value;
  });
  ipcMain.handle('qdb-editor:detect-legacy-downloader', () => {
    const path = join(app.getPath('appData'), 'QDB Downloader', 'qdb-downloader.sqlite');
    return existsSync(path) ? path : undefined;
  });
  ipcMain.handle('qdb-editor:select-legacy-downloader', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select the legacy QDB Downloader database',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
    });
    return result.filePaths[0];
  });
  ipcMain.handle('qdb-editor:preview-legacy-downloader', (_event, sourcePath: string) =>
    legacyMigration.preview(sourcePath),
  );
  ipcMain.handle(
    'qdb-editor:migrate-legacy-downloader',
    (_event, request: Parameters<LegacyDownloaderMigration['migrate']>[0]) =>
      legacyMigration.migrate(request),
  );
};

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 560,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111318' : '#f9f9ff',
    icon: join(app.getAppPath(), 'resources', 'icons', 'qdb-editor-16.png'),
    webPreferences: {
      preload: join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.once('ready-to-show', () => window.show());
  const rendererUrl = process.env['QDB_RENDERER_URL'];
  if (rendererUrl) void window.loadURL(rendererUrl);
  else void window.loadFile(join(app.getAppPath(), 'dist', 'electron', 'browser', 'index.html'));
  return window;
};

const runPreloadSmoke = async (): Promise<void> => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.loadURL('data:text/html;charset=utf-8,<title>QDB preload smoke test</title>');
  const bridge = (await window.webContents.executeJavaScript(`({
    editor: typeof window.qdbEditor?.listProjects === 'function',
    downloader: typeof window.qdbEditor?.downloader?.listProjects === 'function'
  })`)) as {
    editor: boolean;
    downloader: boolean;
  };
  if (!bridge.editor || !bridge.downloader)
    throw new Error(`Desktop bridge smoke test failed: ${JSON.stringify(bridge)}`);
  console.log('Desktop bridge smoke test passed.');
  window.destroy();
};

void app.whenReady().then(async () => {
  if (process.env['QDB_PRELOAD_SMOKE'] === '1') {
    try {
      await runPreloadSmoke();
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
    return;
  }
  Menu.setApplicationMenu(null);
  const libraryPath = join(app.getPath('userData'), 'library');
  catalog = new Catalog(libraryPath);
  snapshotDatabase = new SnapshotDatabase(join(libraryPath, 'catalog.sqlite'));
  legacyMigration = new LegacyDownloaderMigration(
    join(libraryPath, 'catalog.sqlite'),
    catalog.projectsDirectory,
  );
  nativeTheme.themeSource = catalog.getTheme();
  registerHandlers();
  registerDownloaderHandlers({
    database: snapshotDatabase,
    scraper: new SoccerbotScraper(),
    exporter: new SnapshotExporter(snapshotDatabase),
    shell,
    directoryExists: async (directory) => (await stat(directory)).isDirectory(),
    removeExportDirectory: (directory) => rm(directory, { recursive: true, force: true }),
    exportedDirectories: downloaderExportDirectories,
    projectLifecycle: {
      createProject: (request) => {
        const project = catalog.createProject(request);
        return snapshotDatabase.getProjectSummary(project.id);
      },
      renameProject: (request) => {
        const project = catalog.project(request.projectId);
        catalog.updateProject({
          id: project.id,
          name: request.name,
          referenceDate: project.referenceDate,
        });
        return snapshotDatabase.getProjectSummary(project.id);
      },
      deleteProject: (projectId) => {
        catalog.removeProject(projectId);
      },
      deleteAllProjects: () => {
        const projectIds = catalog.listProjects().map(({ id }) => id);
        for (const projectId of projectIds) catalog.removeProject(projectId);
        return projectIds;
      },
    },
  });
  createWindow();
  if (app.isPackaged)
    updateElectronApp({
      repo: 'Celtian/qdb-editor-16',
      updateInterval: '1 hour',
    });
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  snapshotDatabase?.close();
  catalog?.close();
  if (process.platform !== 'darwin') app.quit();
});
