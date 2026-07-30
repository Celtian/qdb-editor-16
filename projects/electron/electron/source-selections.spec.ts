import { describe, expect, it } from 'vitest';
import { SourceSelections } from './source-selections';

describe('SourceSelections', () => {
  it('stores and consumes inspected sources exactly once', () => {
    const selections = new SourceSelections();
    const candidate = selections.addSource({
      suggestedName: 'Career',
      sourceKind: 'text-folder',
      originalPaths: ['/source'],
      tables: [{ table: 'players', rows: 2 }],
      unsupportedTables: [],
      warnings: [],
    });

    expect(selections.source(candidate.selectionId).inspection).toEqual(candidate);
    expect(selections.consume(candidate.selectionId).inspection.suggestedName).toBe('Career');
    expect(() => selections.source(candidate.selectionId)).toThrow(/expired/i);
  });

  it('pairs only database and metadata selections', () => {
    const selections = new SourceSelections();
    const database = selections.addFile('database', 'C:\\data\\career.db');
    const metadata = selections.addFile('metadata', '/data/career.xml');

    expect(database.fileName).toBe('career.db');
    expect(metadata.fileName).toBe('career.xml');
    expect(selections.resolvePair(database.id, metadata.id)).toEqual([
      'C:\\data\\career.db',
      '/data/career.xml',
    ]);
    expect(() => selections.resolvePair(metadata.id, database.id)).toThrow(/both/i);
  });
});
