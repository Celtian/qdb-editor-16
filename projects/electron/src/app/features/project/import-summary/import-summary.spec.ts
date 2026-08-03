import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';

import axe from 'axe-core';

import type {
  CommitImportRequest,
  ImportPreview,
  MergeImportOptions,
} from '../../../../../shared/downloader/contracts';
import { ImportSummary, type ImportSummaryDetails } from './import-summary';

const details: ImportSummaryDetails = {
  operation: 'New import',
  sourceName: 'transfermarkt',
  entity: 'League',
  name: 'Premier League',
  identifier: 'GB1',
  season: '2026',
  teamCount: 1,
  playerCount: 1,
};

const options: MergeImportOptions = {
  existingRecords: 'refresh',
  teamLeagueConflicts: 'move',
  playerTeamConflicts: 'move',
};

const preview = (legacyCopyCount = 1): ImportPreview => ({
  changes: {
    leagues: { added: 0, updated: 1, preserved: 0, deleted: 0 },
    teams: { added: 2, updated: 3, preserved: 0, moved: 1, detached: 1, deleted: 1 },
    players: {
      added: 10,
      updated: 20,
      preserved: 1,
      moved: 1,
      deduplicated: legacyCopyCount > 1 ? 1 : 0,
      deleted: 4,
    },
  },
  conflicts: {
    existingRecords: [
      {
        entity: 'teams',
        sourceName: 'transfermarkt',
        sourceId: '281',
        storedName: 'Stored City',
        incomingName: 'Manchester City',
      },
    ],
    teamLeagueConflicts: [
      {
        entity: 'teams',
        sourceName: 'transfermarkt',
        sourceId: '281',
        name: 'Manchester City',
        currentParents: ['Championship'],
        incomingParent: 'Premier League',
        legacyCopyCount: 1,
      },
    ],
    playerTeamConflicts: [
      {
        entity: 'players',
        sourceName: 'transfermarkt',
        sourceId: '10',
        name: 'Example Player',
        currentParents: ['Old Team'],
        incomingParent: 'Manchester City',
        legacyCopyCount,
      },
    ],
  },
});

const mergeRequest: CommitImportRequest = {
  projectId: 'project-id',
  sourceName: 'transfermarkt',
  operation: { kind: 'merge', options },
  league: {
    sourceId: 'GB1',
    name: 'Premier League',
    season: '2026',
    sourceUrl: 'https://example.test/GB1',
  },
  teams: [],
};

describe('ImportSummary', () => {
  it('shows inline merge conflicts and emits changed policies', async () => {
    await TestBed.configureTestingModule({ imports: [ImportSummary] }).compileComponents();
    const fixture = TestBed.createComponent(ImportSummary);
    fixture.componentRef.setInput('details', details);
    fixture.componentRef.setInput('preview', preview());
    fixture.componentRef.setInput('request', mergeRequest);
    fixture.componentRef.setInput('mergeOptions', options);
    const emitted = vi.fn();
    fixture.componentInstance.mergeOptionsChange.subscribe(emitted);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const existingPolicy = await loader.getHarness(
      MatSelectHarness.with({ selector: '.qdb-existing-record-policy' }),
    );

    expect(fixture.nativeElement.textContent).toContain('GB1 — Premier League');
    expect(fixture.nativeElement.textContent).toContain('Championship → Premier League');
    expect(await existingPolicy.getValueText()).toBe('Refresh from Transfermarkt');
    await existingPolicy.open();
    await existingPolicy.clickOptions({ text: 'Keep stored data' });
    expect(emitted).toHaveBeenCalledWith({ ...options, existingRecords: 'keep' });
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('forces consolidation of historical player copies', async () => {
    await TestBed.configureTestingModule({ imports: [ImportSummary] }).compileComponents();
    const fixture = TestBed.createComponent(ImportSummary);
    fixture.componentRef.setInput('details', details);
    fixture.componentRef.setInput('preview', preview(2));
    fixture.componentRef.setInput('request', mergeRequest);
    fixture.componentRef.setInput('mergeOptions', options);
    await fixture.whenStable();
    const playerPolicy = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      MatSelectHarness.with({ selector: '.qdb-player-team-policy' }),
    );

    expect(await playerPolicy.isDisabled()).toBe(true);
    expect(await playerPolicy.getValueText()).toBe('Move to imported team');
    expect(fixture.nativeElement.textContent).toContain('must be consolidated');
  });

  it('labels WorldFootball records and reports that seasons are not used', async () => {
    await TestBed.configureTestingModule({ imports: [ImportSummary] }).compileComponents();
    const fixture = TestBed.createComponent(ImportSummary);
    const worldFootballPreview = preview();
    for (const conflict of [
      ...worldFootballPreview.conflicts.existingRecords,
      ...worldFootballPreview.conflicts.teamLeagueConflicts,
      ...worldFootballPreview.conflicts.playerTeamConflicts,
    ]) {
      conflict.sourceName = 'worldfootball';
    }
    fixture.componentRef.setInput('details', {
      ...details,
      sourceName: 'worldfootball',
      identifier: 'co7093/mexico-lp---serie-b',
      name: 'Mexico LP - Serie B',
      season: undefined,
    });
    fixture.componentRef.setInput('preview', worldFootballPreview);
    fixture.componentRef.setInput('request', {
      ...mergeRequest,
      sourceName: 'worldfootball',
      league: {
        sourceId: 'co7093/mexico-lp---serie-b',
        name: 'Mexico LP - Serie B',
        sourceUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
      },
    });
    fixture.componentRef.setInput('mergeOptions', options);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('WorldFootball · co7093/mexico-lp---serie-b');
    expect(text).toContain('Season');
    expect(text).toContain('Not used');
    expect(text).toContain('Refresh from WorldFootball');
  });

  it('labels Eurofotbal records and reports that seasons are not used', async () => {
    await TestBed.configureTestingModule({ imports: [ImportSummary] }).compileComponents();
    const fixture = TestBed.createComponent(ImportSummary);
    const eurofotbalPreview = preview();
    for (const conflict of [
      ...eurofotbalPreview.conflicts.existingRecords,
      ...eurofotbalPreview.conflicts.teamLeagueConflicts,
      ...eurofotbalPreview.conflicts.playerTeamConflicts,
    ]) {
      conflict.sourceName = 'eurofotbal';
    }
    fixture.componentRef.setInput('details', {
      ...details,
      sourceName: 'eurofotbal',
      identifier: 'chance-liga/2026-2027',
      name: 'Chance Liga',
      season: undefined,
    });
    fixture.componentRef.setInput('preview', eurofotbalPreview);
    fixture.componentRef.setInput('request', {
      ...mergeRequest,
      sourceName: 'eurofotbal',
      league: {
        sourceId: 'chance-liga/2026-2027',
        name: 'Chance Liga',
        sourceUrl: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
      },
    });
    fixture.componentRef.setInput('mergeOptions', options);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('Eurofotbal · chance-liga/2026-2027');
    expect(text).toContain('Season');
    expect(text).toContain('Not used');
    expect(text).toContain('Refresh from Eurofotbal');
  });

  it('shows exact synchronization counts, policies, conflicts, and warnings', async () => {
    await TestBed.configureTestingModule({ imports: [ImportSummary] }).compileComponents();
    const fixture = TestBed.createComponent(ImportSummary);
    fixture.componentRef.setInput('details', { ...details, operation: 'Update existing' });
    fixture.componentRef.setInput('preview', preview());
    fixture.componentRef.setInput('request', {
      ...mergeRequest,
      operation: {
        kind: 'synchronize',
        target: { entity: 'leagues', id: 'league-id' },
        options: {
          absentTeams: 'detach',
          absentPlayers: 'delete',
          overrideTeamNames: false,
          overridePlayerNames: true,
          teamLeagueConflicts: 'move',
          playerTeamConflicts: 'move',
        },
      },
    });
    fixture.componentRef.setInput('mergeOptions', options);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Absent teams will be removed from this league');
    expect(element.textContent).toContain('Absent players will be permanently deleted.');
    expect(element.textContent).toContain('Existing team names will be preserved.');
    expect(element.textContent).toContain('Existing player names will be replaced');
    expect(element.textContent).toContain('Championship → Premier League');
    expect(element.textContent).toContain('Old Team → Manchester City');
    expect(element.textContent).toContain('5 stored records will be permanently deleted.');
    expect(element.textContent).toContain('1 team will be removed from this league');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(element.querySelectorAll('td.destructive')).toHaveLength(2);
  });
});
