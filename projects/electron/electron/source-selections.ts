import { randomUUID } from 'node:crypto';
import type { ImportCandidate, SourceFileSelection } from '../shared/contracts';

export interface SelectedSource {
  selectionId: string;
  inspection: ImportCandidate;
}

export class SourceSelections {
  private readonly sources = new Map<string, SelectedSource>();
  private readonly files = new Map<string, { kind: 'database' | 'metadata'; path: string }>();

  addSource(inspection: Omit<ImportCandidate, 'selectionId'>): ImportCandidate {
    const selectionId = randomUUID();
    const candidate = { ...inspection, selectionId };
    this.sources.set(selectionId, { selectionId, inspection: candidate });
    return candidate;
  }

  source(id: string): SelectedSource {
    const source = this.sources.get(id);
    if (!source) throw new Error('The selected import source has expired. Select it again.');
    return source;
  }

  consume(id: string): SelectedSource {
    const source = this.source(id);
    this.sources.delete(id);
    return source;
  }

  addFile(kind: 'database' | 'metadata', path: string): SourceFileSelection {
    const id = randomUUID();
    this.files.set(id, { kind, path });
    return {
      id,
      displayPath: path,
      fileName: path.split(/[\\/]/).at(-1) ?? path,
    };
  }

  resolvePair(databaseFileId: string, metadataFileId: string): [string, string] {
    const database = this.files.get(databaseFileId);
    const metadata = this.files.get(metadataFileId);
    if (database?.kind !== 'database' || metadata?.kind !== 'metadata')
      throw new Error('Select both a database and metadata file.');
    return [database.path, metadata.path];
  }
}
