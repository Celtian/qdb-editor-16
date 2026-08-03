import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { FIFA_TABLES, fieldsFor } from '../shared/table-config';
import { encodeFifaText } from '../shared/text-format';
import { FifaDatabase } from './fifa-database';

const sanitizeName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'database';

const timestamp = (): string =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

const uniqueOutputPath = async (parent: string, name: string): Promise<string> => {
  const base = `${sanitizeName(name)}-fifa16-${timestamp()}`;
  const existing = new Set(await readdir(parent));
  if (!existing.has(base)) return join(parent, base);
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return join(parent, `${base}-${suffix}`);
};

export const exportDatabase = async (
  databasePath: string,
  databaseName: string,
  targetParentPath: string,
  progress?: (message: string) => void,
): Promise<string> => {
  await mkdir(targetParentPath, { recursive: true });
  const outputPath = await uniqueOutputPath(targetParentPath, databaseName);
  const temporaryPath = join(
    targetParentPath,
    `.${basename(outputPath)}.${randomUUID()}.exporting`,
  );
  const database = new FifaDatabase(databasePath, true);
  await mkdir(temporaryPath, { recursive: true });
  try {
    for (const [index, table] of FIFA_TABLES.entries()) {
      progress?.(`Exporting ${table} (${index + 1}/${FIFA_TABLES.length})…`);
      const fields = fieldsFor(table);
      const rows = database.readAllRows(table);
      await writeFile(
        join(temporaryPath, `${table}.txt`),
        encodeFifaText(
          fields.map((field) => field.name),
          rows.map((row) => row.values),
        ),
      );
    }
    database.close();
    await rename(temporaryPath, outputPath);
    return outputPath;
  } catch (error) {
    database.close();
    await rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
};
