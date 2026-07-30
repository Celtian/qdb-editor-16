import { contextBridge, ipcRenderer } from 'electron';
import type { QdbEditorApi } from '../shared/contracts';

const api: QdbEditorApi = {
  listProjects: () => ipcRenderer.invoke('qdb-editor:list-projects'),
  createProject: (request) => ipcRenderer.invoke('qdb-editor:create-project', request),
  updateProject: (request) => ipcRenderer.invoke('qdb-editor:update-project', request),
  removeProject: (id) => ipcRenderer.invoke('qdb-editor:remove-project', id),
  listDatabases: (projectId) => ipcRenderer.invoke('qdb-editor:list-databases', projectId),
  createBlankDatabase: (request) => ipcRenderer.invoke('qdb-editor:create-blank-database', request),
  renameDatabase: (id, name) => ipcRenderer.invoke('qdb-editor:rename-database', id, name),
  removeDatabase: (id) => ipcRenderer.invoke('qdb-editor:remove-database', id),
  selectTextSource: () => ipcRenderer.invoke('qdb-editor:select-text-source'),
  selectT3dbDatabaseFile: () => ipcRenderer.invoke('qdb-editor:select-t3db-database'),
  selectT3dbMetadataFile: () => ipcRenderer.invoke('qdb-editor:select-t3db-metadata'),
  prepareT3dbSource: (request) => ipcRenderer.invoke('qdb-editor:prepare-t3db', request),
  importDatabase: (request) => ipcRenderer.invoke('qdb-editor:import-database', request),
  listTables: (databaseId) => ipcRenderer.invoke('qdb-editor:list-tables', databaseId),
  readTable: (request) => ipcRenderer.invoke('qdb-editor:read-table', request),
  readRow: (databaseId, table, rowId) =>
    ipcRenderer.invoke('qdb-editor:read-row', databaseId, table, rowId),
  saveRow: (request) => ipcRenderer.invoke('qdb-editor:save-row', request),
  deleteRow: (request) => ipcRenderer.invoke('qdb-editor:delete-row', request),
  validateDatabase: (databaseId) => ipcRenderer.invoke('qdb-editor:validate-database', databaseId),
  getValidation: (databaseId) => ipcRenderer.invoke('qdb-editor:get-validation', databaseId),
  selectExportDirectory: () => ipcRenderer.invoke('qdb-editor:select-export-directory'),
  exportDatabase: (request) => ipcRenderer.invoke('qdb-editor:export-database', request),
  revealExport: (path) => ipcRenderer.invoke('qdb-editor:reveal-export', path),
  cancelOperation: (operation) => ipcRenderer.invoke('qdb-editor:cancel-operation', operation),
  getTheme: () => ipcRenderer.invoke('qdb-editor:get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('qdb-editor:set-theme', theme),
  onProgress: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) =>
      listener(progress);
    ipcRenderer.on('qdb-editor:progress', wrapped);
    return () => ipcRenderer.removeListener('qdb-editor:progress', wrapped);
  },
};

contextBridge.exposeInMainWorld('qdbEditor', api);
