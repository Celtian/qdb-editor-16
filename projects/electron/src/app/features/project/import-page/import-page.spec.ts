import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatFormFieldHarness } from '@angular/material/form-field/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatRadioButtonHarness, MatRadioGroupHarness } from '@angular/material/radio/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatStepperHarness } from '@angular/material/stepper/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import axe from 'axe-core';
import type {
  CommitImportRequest,
  ExternalTeam,
  ImportPreview,
  League,
  MergeImportOptions,
  SourceName,
  TeamPreview,
} from '../../../../../shared/downloader/contracts';
import { DesktopApi } from '../../../core/downloader-api';
import { ConfettiService } from '../../../shared/confetti/confetti.service';
import { ImportPage } from './import-page';

const emptyPreview = (): ImportPreview => ({
  changes: {
    leagues: { added: 1, updated: 0, preserved: 0, deleted: 0 },
    teams: { added: 1, updated: 0, preserved: 0, moved: 0, detached: 0, deleted: 0 },
    players: {
      added: 1,
      updated: 0,
      preserved: 0,
      moved: 0,
      deduplicated: 0,
      deleted: 0,
    },
  },
  conflicts: {
    existingRecords: [],
    teamLeagueConflicts: [],
    playerTeamConflicts: [],
  },
});

const route = (query: Record<string, string> = {}) => ({
  parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
  snapshot: { queryParamMap: convertToParamMap(query) },
});

const selectedStepLabel = (element: HTMLElement): string =>
  element
    .querySelector<HTMLElement>('.mat-step-header[aria-selected="true"]')
    ?.textContent.trim() ?? '';

interface TestImportPage {
  operation: WritableSignal<'merge' | 'synchronize'>;
  mode: WritableSignal<'league' | 'team'>;
  sourceName: WritableSignal<SourceName>;
  name: WritableSignal<string>;
  identifier: WritableSignal<string>;
  season: WritableSignal<string>;
  error: WritableSignal<string>;
  errorLocation: WritableSignal<'page' | 'target' | 'name' | 'identifier'>;
  teamSelection: { selected: ExternalTeam[] };
  mergeOptions: WritableSignal<MergeImportOptions>;
  preparedRequest: WritableSignal<CommitImportRequest | undefined>;
  jobId: WritableSignal<string>;
  changeOperation(operation: 'merge' | 'synchronize'): void;
  changeMode(mode: 'league' | 'team'): void;
  changeSource(sourceName: SourceName): void;
  setName(value: string): void;
  setIdentifier(value: string): void;
  setSeason(value: string): void;
  preview(): Promise<void>;
  loadSelectedSquads(): Promise<void>;
  togglePlayer(teamId: string, playerKey: string, selected: boolean): void;
  review(): Promise<void>;
  commit(): Promise<void>;
  cancel(): void;
}

async function createPage(
  api: object,
  query: Record<string, string> = {},
): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<ImportPage>>;
  page: TestImportPage;
  router: { navigate: ReturnType<typeof vi.fn> };
  confetti: { celebrate: ReturnType<typeof vi.fn> };
}> {
  const router = { navigate: vi.fn(() => Promise.resolve(true)) };
  const confetti = { celebrate: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [ImportPage],
    providers: [
      { provide: DesktopApi, useValue: api },
      { provide: ConfettiService, useValue: confetti },
      { provide: ActivatedRoute, useValue: route(query) },
      { provide: Router, useValue: router },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ImportPage);
  await fixture.whenStable();
  return {
    fixture,
    page: fixture.componentInstance as unknown as TestImportPage,
    router,
    confetti,
  };
}

describe('ImportPage', () => {
  it('uses numbered dynamic wizard steps for all operation and entity combinations', async () => {
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      listEntities: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { rows: [], total: 0, pageIndex: 0, pageSize: 25 },
        }),
      ),
    };
    const { fixture, page } = await createPage(api);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    const labels = async () =>
      Promise.all((await stepper.getSteps()).map((step) => step.getLabel()));

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('app-page-header mat-icon')
        ?.textContent?.trim(),
    ).toBe('download');
    expect(await labels()).toEqual([
      'Operation',
      'Entity',
      'Provider',
      'Source details',
      'Teams',
      'Players',
      'Summary',
    ]);
    const icons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '.mat-step-icon-content',
      ),
    ];
    expect(icons.map((icon) => icon.textContent.trim())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(icons.every((icon) => !icon.querySelector('mat-icon'))).toBe(true);
    const operationOptions = await loader.getHarness(
      MatRadioGroupHarness.with({ selector: '.operation-options' }),
    );
    const entityOptions = await loader.getHarness(
      MatRadioGroupHarness.with({ selector: '.entity-options' }),
    );
    expect(await operationOptions.getCheckedValue()).toBe('merge');
    expect(await entityOptions.getCheckedValue()).toBe('league');
    const providerOptions = await loader.getHarness(
      MatRadioGroupHarness.with({ selector: '.provider-options' }),
    );
    expect(await providerOptions.getCheckedValue()).toBe('transfermarkt');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Transfermarkt — Recommended');
    expect(element.textContent).toContain(
      'Best coverage and faster imports. Supports optional seasons.',
    );
    expect(element.textContent).toContain('Soccerway — Alternative');
    expect(element.textContent).toContain(
      'Use when Transfermarkt data is unavailable. Imports are slower because Soccerway rate-limits requests. Seasons are not supported.',
    );
    expect(element.textContent).toContain('WorldFootball — Alternative');
    expect(element.textContent).toContain(
      'Global coverage with detailed player profiles. Squad imports can take longer because profiles are loaded separately. Seasons are not supported.',
    );
    expect(element.textContent).toContain('Eurofotbal — Alternative');
    expect(element.textContent).toContain(
      'Very fast, Europe-focused league and squad imports. League seasons are part of the Source ID.',
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('mat-button-toggle').length,
    ).toBe(0);

    page.changeMode('team');
    await fixture.whenStable();
    expect(await labels()).toEqual([
      'Operation',
      'Entity',
      'Provider',
      'Source details',
      'Players',
      'Summary',
    ]);
    await stepper.selectStep({ label: 'Source details' });
    expect(element.querySelector('mat-select[aria-label="Import provider"]')).toBeNull();
    const teamUrlExample = (fixture.nativeElement as HTMLElement).querySelector(
      '.source-url-example',
    );
    expect(teamUrlExample?.textContent.trim()).toBe(
      'https://www.transfermarkt.com/slug/kader/verein/281/plus/1',
    );
    expect(teamUrlExample?.querySelector('strong')?.textContent).toBe('281');
    expect(teamUrlExample?.closest('a')?.getAttribute('href')).toBe(
      'https://www.transfermarkt.com/slug/kader/verein/281/plus/1',
    );
    expect(
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('mat-hint strong')].map(
        (example) => example.textContent,
      ),
    ).toEqual(['281', '2026']);

    page.changeOperation('synchronize');
    await fixture.whenStable();
    expect(api.listEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceNames: ['transfermarkt'] }),
    );
    expect(await labels()).toEqual([
      'Operation',
      'Entity',
      'Provider',
      'Source details',
      'Update options',
      'Players',
      'Summary',
    ]);
    page.changeSource('soccerway');
    await fixture.whenStable();
    expect(api.listEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceNames: ['soccerway'] }),
    );

    page.changeMode('league');
    await fixture.whenStable();
    expect(await labels()).toEqual([
      'Operation',
      'Entity',
      'Provider',
      'Source details',
      'Update options',
      'Teams',
      'Players',
      'Summary',
    ]);
    await stepper.selectStep({ label: 'Provider' });
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  }, 15_000);

  it('shows source validation with mat-error without leaving the current step', async () => {
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      previewLeague: vi.fn(),
    };
    const { fixture, page } = await createPage(api);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Source details' });

    const element = fixture.nativeElement as HTMLElement;
    const transfermarktUrlExample = element.querySelector('.source-url-example');
    expect(transfermarktUrlExample?.textContent.trim()).toBe(
      'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1',
    );
    expect(transfermarktUrlExample?.querySelector('strong')?.textContent).toBe('GB1');
    const transfermarktUrlLink = transfermarktUrlExample?.closest('a');
    expect(transfermarktUrlLink?.getAttribute('href')).toBe(
      'https://www.transfermarkt.com/slug/startseite/wettbewerb/GB1',
    );
    expect(transfermarktUrlLink?.getAttribute('target')).toBe('_blank');
    expect(transfermarktUrlLink?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['GB1', '2026']);
    const continueButton = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent.includes('Continue'),
    );
    continueButton?.click();
    await fixture.whenStable();

    const identifierField = await loader.getHarness(
      MatFormFieldHarness.with({ floatingLabelText: 'Transfermarkt source ID or URL' }),
    );
    expect(api.previewLeague).not.toHaveBeenCalled();
    expect(page.error()).toBe('Enter a Transfermarkt source ID or URL.');
    expect(page.errorLocation()).toBe('identifier');
    expect(selectedStepLabel(element)).toContain('Source details');
    expect(await identifierField.getTextErrors()).toEqual([
      'Enter a Transfermarkt source ID or URL.',
    ]);
    const identifierInput = await identifierField.getControl(MatInputHarness);
    if (!identifierInput) {
      throw new Error('Expected the identifier form field to contain an input');
    }
    expect(await (await identifierInput.host()).getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('.page-error')).toBeNull();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('resets source details and applies Soccerway validation, guidance, and season handling', async () => {
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      previewLeague: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            sourceId: 'czech-republic/chance-liga/standings/bNFMkskm',
            name: 'Chance Liga',
            sourceUrl:
              'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
            teams: [],
          },
        }),
      ),
    };
    const { fixture, page } = await createPage(api);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Source details' });
    page.setName('Old name');
    page.setIdentifier('GB1');
    page.setSeason('2026');
    page.preparedRequest.set({} as CommitImportRequest);

    const element = fixture.nativeElement as HTMLElement;
    const soccerway = await loader.getHarness(
      MatRadioButtonHarness.with({ selector: 'mat-radio-button[value="soccerway"]' }),
    );
    await soccerway.check();
    await fixture.whenStable();

    expect(page.sourceName()).toBe('soccerway');
    expect(page.name()).toBe('');
    expect(page.identifier()).toBe('');
    expect(page.season()).toBe('');
    expect(page.preparedRequest()).toBeUndefined();
    expect(element.textContent).not.toContain('Season (optional)');
    const soccerwayUrlExample = element.querySelector('.source-url-example');
    expect(soccerwayUrlExample?.textContent.trim()).toBe(
      'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
    );
    expect(soccerwayUrlExample?.querySelector('strong')?.textContent).toBe(
      'czech-republic/chance-liga/standings/bNFMkskm',
    );
    expect(element.querySelector('.source-url-card')?.textContent).toContain(
      'The highlighted text is the Source ID stored in the database.',
    );
    expect(soccerwayUrlExample?.closest('a')?.getAttribute('href')).toBe(
      'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
    );
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['czech-republic/chance-liga/standings/bNFMkskm']);

    page.setIdentifier('GB1');
    await page.preview();
    expect(api.previewLeague).not.toHaveBeenCalled();
    expect(page.error()).toBe('Use a valid Soccerway league ID or URL.');

    page.setIdentifier(
      'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
    );
    await page.preview();
    await fixture.whenStable();
    expect(api.previewLeague).toHaveBeenCalledWith({
      sourceName: 'soccerway',
      identifierOrUrl:
        'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
      season: undefined,
    });
    expect(page.name()).toBe('Chance Liga');
    expect(element.querySelector('.provider-notice')?.textContent).toContain(
      'Squad loading can be slow',
    );
    expect(element.querySelector('.provider-notice')?.textContent).toContain(
      'import the rest in additional batches',
    );
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('applies WorldFootball validation, canonical guidance, and seasonless previews', async () => {
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      previewLeague: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            sourceId: 'co7093/mexico-lp---serie-b',
            name: 'Mexico Lp Serie B',
            sourceUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
            teams: [],
          },
        }),
      ),
    };
    const { fixture, page } = await createPage(api);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Source details' });
    page.setSeason('2026');

    const worldFootball = await loader.getHarness(
      MatRadioButtonHarness.with({ selector: 'mat-radio-button[value="worldfootball"]' }),
    );
    await worldFootball.check();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(page.sourceName()).toBe('worldfootball');
    expect(page.season()).toBe('');
    expect(element.textContent).not.toContain('Season (optional)');
    const urlExample = element.querySelector('.source-url-example');
    expect(urlExample?.textContent.trim()).toBe(
      'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
    );
    expect(urlExample?.querySelector('strong')?.textContent).toBe('co7093/mexico-lp---serie-b');
    expect(urlExample?.closest('a')?.getAttribute('href')).toBe(
      'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
    );
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['co7093/mexico-lp---serie-b']);
    expect(element.querySelector('.source-url-card')?.textContent).toContain(
      'WorldFootball imports do not use a season.',
    );

    page.setIdentifier('te237557/artesanos-metepec');
    await page.preview();
    expect(api.previewLeague).not.toHaveBeenCalled();
    expect(page.error()).toBe('Use a valid WorldFootball league ID or URL.');

    page.setIdentifier('https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/');
    await page.preview();
    await fixture.whenStable();
    expect(api.previewLeague).toHaveBeenCalledWith({
      sourceName: 'worldfootball',
      identifierOrUrl: 'https://www.worldfootball.net/competition/co7093/mexico-lp---serie-b/',
      season: undefined,
    });
    expect(page.name()).toBe('Mexico Lp Serie B');
    expect(element.querySelector('.provider-notice')?.textContent).toContain(
      'Fetch no more than two squads at a time',
    );
    expect(element.querySelector('.provider-notice')?.textContent).toContain(
      'import them in another batch',
    );
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('applies Eurofotbal validation, canonical guidance, and seasonless previews', async () => {
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      previewLeague: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            sourceId: 'chance-liga/2026-2027',
            name: 'Chance Liga',
            sourceUrl: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
            teams: [],
          },
        }),
      ),
    };
    const { fixture, page } = await createPage(api);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Source details' });
    page.setSeason('2026');

    const eurofotbal = await loader.getHarness(
      MatRadioButtonHarness.with({ selector: 'mat-radio-button[value="eurofotbal"]' }),
    );
    await eurofotbal.check();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(page.sourceName()).toBe('eurofotbal');
    expect(page.season()).toBe('');
    expect(element.textContent).not.toContain('Season (optional)');
    const urlExample = element.querySelector('.source-url-example');
    expect(urlExample?.textContent.trim()).toBe(
      'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
    );
    expect(urlExample?.querySelector('strong')?.textContent).toBe('chance-liga/2026-2027');
    expect(urlExample?.closest('a')?.getAttribute('href')).toBe(
      'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
    );
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['chance-liga/2026-2027']);
    expect(element.querySelector('.source-url-card')?.textContent).toContain(
      'Eurofotbal imports are very fast.',
    );
    expect(element.querySelector('.source-url-card')?.textContent).toContain(
      'redirected URLs cannot be loaded',
    );
    expect(element.querySelector('.source-url-card')?.textContent).toContain(
      'For league imports, the season is part of the Source ID.',
    );

    page.setIdentifier('cesko/sparta-praha/extra');
    await page.preview();
    expect(api.previewLeague).not.toHaveBeenCalled();
    expect(page.error()).toBe('Use a valid Eurofotbal league ID or URL.');

    page.setIdentifier('https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/');
    await page.preview();
    await fixture.whenStable();
    expect(api.previewLeague).toHaveBeenCalledWith({
      sourceName: 'eurofotbal',
      identifierOrUrl: 'https://www.eurofotbal.cz/chance-liga/2026-2027/tabulky/',
      season: undefined,
    });
    expect(page.name()).toBe('Chance Liga');
    expect(element.querySelector('.provider-notice')).toBeNull();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('runs a new league import through team and player selection into inline review', async () => {
    const teams: ExternalTeam[] = [
      {
        sourceId: '281',
        name: 'Manchester City',
        season: '2026',
        sourceUrl: 'https://example.test/281',
      },
      {
        sourceId: '31',
        name: 'Liverpool',
        season: '2026',
        sourceUrl: 'https://example.test/31',
      },
    ];
    const squad: TeamPreview = {
      ...teams[0],
      players: [
        { sourceId: '10', name: 'First Player' },
        { sourceId: '11', name: 'Second Player' },
      ],
    };
    const importPreview: ImportPreview = {
      ...emptyPreview(),
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
        teamLeagueConflicts: [],
        playerTeamConflicts: [
          {
            entity: 'players',
            sourceName: 'transfermarkt',
            sourceId: '10',
            name: 'First Player',
            currentParents: ['Old Team'],
            incomingParent: 'Manchester City',
            legacyCopyCount: 2,
          },
        ],
      },
    };
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      previewLeague: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            sourceId: 'GB1',
            name: 'Premier League',
            season: '2026',
            sourceUrl: 'https://example.test/GB1',
            teams,
          },
        }),
      ),
      previewTeams: vi.fn(() => Promise.resolve({ ok: true as const, value: [squad] })),
      previewImportChanges: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: importPreview }),
      ),
      commitImport: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { leagueCount: 1, teamCount: 1, playerCount: 1, changes: importPreview.changes },
        }),
      ),
      getProjectSummary: vi.fn(() => Promise.resolve({ ok: true as const, value: {} })),
      cancelScrape: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    };
    const { fixture, page, router, confetti } = await createPage(api);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Source details' });
    page.setIdentifier('GB1');

    await page.preview();
    await fixture.whenStable();
    expect(page.name()).toBe('Premier League');
    expect(page.teamSelection.selected).toHaveLength(2);
    expect(selectedStepLabel(fixture.nativeElement as HTMLElement)).toContain('Teams');
    const allTeams = await loader.getHarness(MatCheckboxHarness.with({ label: 'All 2 teams' }));
    const liverpool = await loader.getHarness(MatCheckboxHarness.with({ label: 'Liverpool' }));
    expect(await allTeams.isChecked()).toBe(true);
    await liverpool.uncheck();
    expect(await allTeams.isIndeterminate()).toBe(true);

    await page.loadSelectedSquads();
    await fixture.whenStable();
    expect(api.previewTeams).toHaveBeenCalledWith({
      sourceName: 'transfermarkt',
      jobId: expect.any(String),
      teams: [teams[0]],
    });
    expect(selectedStepLabel(fixture.nativeElement as HTMLElement)).toContain('Players');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);

    page.togglePlayer('281', '11', false);
    page.mergeOptions.set({
      existingRecords: 'refresh',
      teamLeagueConflicts: 'move',
      playerTeamConflicts: 'keep',
    });
    await page.review();
    await fixture.whenStable();
    expect(selectedStepLabel(fixture.nativeElement as HTMLElement)).toContain('Summary');
    expect(api.previewImportChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-id',
        teams: [expect.objectContaining({ players: [{ sourceId: '10', name: 'First Player' }] })],
      }),
    );
    expect(fixture.nativeElement.textContent).toContain('GB1 — Premier League');
    expect(api.previewImportChanges).toHaveBeenCalledTimes(2);
    expect(page.preparedRequest()?.operation).toEqual({
      kind: 'merge',
      options: {
        existingRecords: 'refresh',
        teamLeagueConflicts: 'move',
        playerTeamConflicts: 'move',
      },
    });

    const existingPolicy = await loader.getHarness(
      MatSelectHarness.with({ selector: '.existing-record-policy' }),
    );
    await existingPolicy.open();
    await existingPolicy.clickOptions({ text: 'Keep stored data' });
    await fixture.whenStable();
    expect(api.previewImportChanges).toHaveBeenCalledTimes(3);
    expect(page.preparedRequest()?.operation).toEqual({
      kind: 'merge',
      options: {
        existingRecords: 'keep',
        teamLeagueConflicts: 'move',
        playerTeamConflicts: 'move',
      },
    });
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);

    await page.commit();
    expect(api.commitImport).toHaveBeenCalledWith(page.preparedRequest());
    expect(confetti.celebrate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/projects', 'project-id']);

    page.jobId.set('job-id');
    page.cancel();
    expect(api.cancelScrape).toHaveBeenCalledWith('job-id');
  }, 15_000);

  it('preloads and locks a directly selected synchronization target', async () => {
    const target: League = {
      id: 'league-id',
      projectId: 'project-id',
      sourceName: 'soccerway',
      sourceId: 'czech-republic/chance-liga/standings/bNFMkskm',
      name: 'Chance Liga',
      sourceUrl:
        'https://www.soccerway.com/czech-republic/chance-liga/standings/bNFMkskm/standings/overall/',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const api = {
      scrapeProgress: signal(undefined).asReadonly(),
      getEntity: vi.fn(() => Promise.resolve({ ok: true as const, value: target })),
    };
    const { fixture } = await createPage(api, {
      operation: 'synchronize',
      entity: 'leagues',
      targetId: 'league-id',
      returnTo: 'leagues',
    });
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    const inputs = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('.fields input'),
    ];

    expect(api.getEntity).toHaveBeenCalledWith('project-id', 'leagues', 'league-id');
    expect(await Promise.all((await stepper.getSteps()).map((step) => step.getLabel()))).toEqual([
      'Operation',
      'Entity',
      'Provider',
      'Source details',
      'Update options',
      'Teams',
      'Players',
      'Summary',
    ]);
    expect(inputs.every((input) => input.readOnly)).toBe(true);
    expect(inputs.map((input) => input.value)).toEqual([
      'czech-republic/chance-liga/standings/bNFMkskm',
      'Chance Liga',
    ]);
    const providerOptions = await loader.getHarness(
      MatRadioGroupHarness.with({ selector: '.provider-options' }),
    );
    expect(await providerOptions.getCheckedValue()).toBe('soccerway');
    const absentTeams = await loader.getHarness(
      MatSelectHarness.with({ selector: '.absent-team-select' }),
    );
    const absentPlayers = await loader.getHarness(
      MatSelectHarness.with({ selector: '.absent-player-select' }),
    );
    expect(await absentTeams.getValueText()).toBe('Keep unchanged');
    expect(await absentPlayers.getValueText()).toBe('Keep unchanged');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  }, 15_000);
});
