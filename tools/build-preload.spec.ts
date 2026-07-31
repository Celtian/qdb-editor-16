import { rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPreload } from './build-preload.mts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('preload bundle', () => {
  it('contains no relative runtime requires and exposes both desktop APIs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qdb-preload-'));
    temporaryDirectories.push(directory);
    const outfile = join(directory, 'preload.js');
    await buildPreload(outfile);
    const source = await readFile(outfile, 'utf8');

    const requiredModules = [...source.matchAll(/\brequire\((['"])(?<module>[^'"]+)\1\)/g)].map(
      (match) => match.groups?.['module'],
    );
    expect(requiredModules.length).toBeGreaterThan(0);
    expect(new Set(requiredModules)).toEqual(new Set(['electron']));

    const invoke = vi.fn();
    let exposedApi: unknown;
    runInNewContext(source, {
      module: { exports: {} },
      exports: {},
      require: (moduleName: string) => {
        if (moduleName !== 'electron') throw new Error(`Unexpected module: ${moduleName}`);
        return {
          contextBridge: {
            exposeInMainWorld: (name: string, api: unknown) => {
              expect(name).toBe('qdbEditor');
              exposedApi = api;
            },
          },
          ipcRenderer: {
            invoke,
            on: vi.fn(),
            removeListener: vi.fn(),
          },
        };
      },
    });

    const api = exposedApi as {
      listProjects: () => Promise<unknown>;
      downloader: { listProjects: () => Promise<unknown> };
    };
    expect(api).toBeDefined();
    expect(api.downloader).toBeDefined();

    await api.listProjects();
    expect(invoke).toHaveBeenLastCalledWith('qdb-editor:list-projects');
    await api.downloader.listProjects();
    expect(invoke).toHaveBeenLastCalledWith('qdb:projects:list');
  });
});
