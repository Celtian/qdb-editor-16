import { parentPort, workerData } from 'node:worker_threads';
import type { SelectedSource } from './source-selections';
import { exportDatabase } from './database-exporter';
import { importDatabase } from './database-importer';
import { FifaDatabase } from './fifa-database';

type WorkerRequest = (
  | {
      action: 'import';
      databaseId: string;
      projectId: string;
      name: string;
      source: SelectedSource;
      outputPath: string;
    }
  | { action: 'validate'; databaseId: string; databasePath: string }
  | {
      action: 'export';
      databasePath: string;
      databaseName: string;
      targetParentPath: string;
    }
) & { cancellationBuffer: SharedArrayBuffer };

const request = workerData as WorkerRequest;
const cancellation = new Int32Array(request.cancellationBuffer);
const checkCancelled = (): void => {
  if (Atomics.load(cancellation, 0)) throw new Error('Operation cancelled.');
};
const progress = (message: string): void => {
  checkCancelled();
  parentPort?.postMessage({ type: 'progress', message });
};

const run = async (): Promise<unknown> => {
  switch (request.action) {
    case 'import':
      return importDatabase(
        request.databaseId,
        request.projectId,
        request.name,
        request.source,
        request.outputPath,
        progress,
        checkCancelled,
      );
    case 'validate': {
      const database = new FifaDatabase(request.databasePath);
      try {
        progress('Validating all FIFA 16 tables…');
        return database.validate(request.databaseId, checkCancelled);
      } finally {
        database.close();
      }
    }
    case 'export':
      return exportDatabase(
        request.databasePath,
        request.databaseName,
        request.targetParentPath,
        progress,
      );
  }
};

void run()
  .then((result) => parentPort?.postMessage({ type: 'result', result }))
  .catch((error: unknown) =>
    parentPort?.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
