import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SnapshotDatabase } from './database.js';

const electron = vi.hoisted(() => ({
  getPath: vi.fn(() => '/documents'),
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: electron.getPath },
  dialog: { showOpenDialog: electron.showOpenDialog },
}));

import { SnapshotExporter } from './exporter.js';

describe('SnapshotExporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('opens the directory picker at the remembered destination', async () => {
    electron.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/selected'],
    });
    const exporter = new SnapshotExporter({} as SnapshotDatabase);

    await expect(exporter.chooseDirectory('/remembered')).resolves.toBe('/selected');
    expect(electron.showOpenDialog).toHaveBeenCalledWith({
      title: 'Choose export destination',
      defaultPath: '/remembered',
      properties: ['openDirectory', 'createDirectory'],
    });
    expect(electron.getPath).not.toHaveBeenCalled();
  });

  test('falls back to Documents and returns no destination when canceled', async () => {
    electron.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const exporter = new SnapshotExporter({} as SnapshotDatabase);

    await expect(exporter.chooseDirectory()).resolves.toBeUndefined();
    expect(electron.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '/documents' }),
    );
    expect(electron.getPath).toHaveBeenCalledWith('documents');
  });
});
