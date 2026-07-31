import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const workspaceRoot = resolve(import.meta.dirname, '..');

export const preloadEntryPath = resolve(workspaceRoot, 'projects/electron/electron/preload.ts');
export const preloadOutputPath = resolve(workspaceRoot, '.electron/electron/electron/preload.js');

export const buildPreload = async (outfile = preloadOutputPath): Promise<void> => {
  await build({
    entryPoints: [preloadEntryPath],
    outfile,
    bundle: true,
    external: ['electron'],
    format: 'cjs',
    logLevel: 'info',
    platform: 'node',
    sourcemap: true,
    target: 'es2022',
  });
};

const entryArgument = process.argv[1];
if (entryArgument && import.meta.url === pathToFileURL(resolve(entryArgument)).href)
  await buildPreload();
