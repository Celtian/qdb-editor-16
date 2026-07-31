import { app, dialog } from 'electron';
import type { ExportRequest, ExportResult, Project } from '../../shared/downloader/contracts.js';
import type { SnapshotDatabase } from './database.js';
import { SnapshotExportWriter } from './export-writer.js';

export class SnapshotExporter {
  private readonly writer: SnapshotExportWriter;

  constructor(database: SnapshotDatabase) {
    this.writer = new SnapshotExportWriter(database);
  }

  async chooseDirectory(defaultPath?: string): Promise<string | undefined> {
    const result = await dialog.showOpenDialog({
      title: 'Choose export destination',
      defaultPath: defaultPath ?? app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    });
    const destination = result.filePaths.find((path) => path.trim());
    if (result.canceled || !destination) return undefined;
    return destination;
  }

  export(project: Project, request: ExportRequest): Promise<ExportResult> {
    return this.writer.write(project, request);
  }
}
