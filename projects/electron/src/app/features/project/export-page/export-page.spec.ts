import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatRadioButtonHarness, MatRadioGroupHarness } from '@angular/material/radio/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatStepperHarness } from '@angular/material/stepper/testing';
import { MatTabGroupHarness } from '@angular/material/tabs/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import axe from 'axe-core';

import type {
  ExportConfigurationPreference,
  ExportFieldNamePresetPreference,
  ExportRequest,
  ExportVisibilityPresetPreference,
} from '../../../../../shared/downloader/contracts';
import {
  defaultExportColumns,
  snakeCaseExportFieldNames,
} from '../../../../../shared/downloader/export-schema';
import { DesktopApi } from '../../../core/downloader-api';
import { EXPORT_COLUMN_PRESETS_STORAGE_KEY } from '../../../core/export-column-presets.service';
import { ConfettiService } from '../../../shared/confetti/confetti.service';
import { ExportPage } from './export-page';

describe('ExportPage', () => {
  const legacyDefaultColumns = () => {
    const columns = defaultExportColumns();
    return {
      leagues: columns.leagues,
      teams: columns.teams,
      players: columns.players,
    };
  };
  const presetApi = () => ({
    getExportVisibilityPresets: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: undefined,
      }),
    ),
    updateExportVisibilityPresets: vi.fn((presets: ExportVisibilityPresetPreference[]) =>
      Promise.resolve({
        ok: true as const,
        value: presets,
      }),
    ),
    getExportFieldNamePresets: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: undefined,
      }),
    ),
    updateExportFieldNamePresets: vi.fn((presets: ExportFieldNamePresetPreference[]) =>
      Promise.resolve({
        ok: true as const,
        value: presets,
      }),
    ),
    getExportConfiguration: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: undefined,
      }),
    ),
    updateExportConfiguration: vi.fn((configuration: ExportConfigurationPreference) =>
      Promise.resolve({
        ok: true as const,
        value: configuration,
      }),
    ),
  });

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: ConfettiService, useValue: { celebrate: vi.fn() } }],
    });
  });

  it('guides the user through six steps and exports the selected data', async () => {
    window.localStorage.setItem(
      EXPORT_COLUMN_PRESETS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        presets: [
          {
            id: 'custom-public-feed',
            name: 'Public feed',
            columns: legacyDefaultColumns(),
          },
        ],
      }),
    );
    const api = {
      ...presetApi(),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            entity: 'teams' as const,
            leagues: [
              {
                id: 'league-1',
                sourceName: 'transfermarkt' as const,
                sourceId: 'GB1',
                name: 'Premier League',
                countryName: 'England',
                tier: 1,
              },
              {
                id: 'league-2',
                sourceName: 'soccerway' as const,
                sourceId: 'GB2',
                name: 'Championship',
              },
            ],
            hasTeamsWithoutLeague: false,
            seasons: ['2026'],
          },
        }),
      ),
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
      chooseExportDirectory: vi.fn(() => Promise.resolve({ ok: true as const, value: '/exports' })),
      exportProject: vi.fn((request: ExportRequest) =>
        Promise.resolve({
          ok: true as const,
          value: {
            directory: `${request.destination}/snapshot`,
            files: [`${request.destination}/snapshot/snapshot.json`],
          },
        }),
      ),
      openExportDirectory: vi.fn(() => Promise.resolve({ ok: true as const, value: true })),
    };
    const confetti = { celebrate: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        { provide: ConfettiService, useValue: confetti },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    const steps = await stepper.getSteps();

    expect(await Promise.all(steps.map((step) => step.getLabel()))).toEqual([
      'Dataset',
      'Format',
      'Columns',
      'Folder',
      'Leagues',
      'Summary',
    ]);
    const stepIcons = [...element.querySelectorAll<HTMLElement>('.mat-step-icon-content')];
    expect(stepIcons.map((icon) => icon.textContent.trim())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(stepIcons.every((icon) => !icon.querySelector('mat-icon'))).toBe(true);
    expect(element.querySelector('h1')?.textContent).toContain('Export data');
    expect(element.textContent).toContain('Source DB');
    expect(element.textContent).toContain(
      'Export the provider-specific records stored in this project.',
    );
    const formats = await loader.getHarness(
      MatRadioGroupHarness.with({ selector: '[aria-label="Export format"]' }),
    );
    expect(await formats.getCheckedValue()).toBe('single-json');
    const formatButtons = await loader.getAllHarnesses(
      MatRadioButtonHarness.with({
        selector:
          'mat-radio-button[value="single-json"], mat-radio-button[value="json"], mat-radio-button[value="csv"]',
      }),
    );
    expect(await Promise.all(formatButtons.map((button) => button.getValue()))).toEqual([
      'single-json',
      'json',
      'csv',
    ]);
    const singleJson = await loader.getHarness(
      MatRadioButtonHarness.with({ selector: 'mat-radio-button[value="single-json"]' }),
    );
    expect(await singleJson.getLabelText()).toContain(
      'One JSON file with players nested under teams',
    );

    await stepper.selectStep({ label: 'Columns' });
    const columnTabGroup = await loader.getHarness(
      MatTabGroupHarness.with({ selector: '[data-export-column-tabs]' }),
    );
    const columnTabs = await columnTabGroup.getTabs();
    const leaguesTab = (await columnTabGroup.getTabs({ label: 'Leagues' }))[0];
    const teamsTab = (await columnTabGroup.getTabs({ label: 'Teams' }))[0];
    expect(await Promise.all(columnTabs.map((tab) => tab.getLabel()))).toEqual([
      'Leagues',
      'Teams',
      'Players',
    ]);
    expect(await (await columnTabGroup.getSelectedTab()).getLabel()).toBe('Leagues');
    const visibilitySelect = await loader.getHarness(
      MatSelectHarness.with({ selector: '[aria-label="Export visibility preset"]' }),
    );
    const fieldNameSelect = await loader.getHarness(
      MatSelectHarness.with({ selector: '[aria-label="Export field-name preset"]' }),
    );
    expect(await visibilitySelect.getValueText()).toBe('Default');
    expect(await fieldNameSelect.getValueText()).toBe('Camel case');
    await visibilitySelect.open();
    expect(
      await Promise.all((await visibilitySelect.getOptions()).map((option) => option.getText())),
    ).toEqual(['Default', 'Full', 'Public feed']);
    await visibilitySelect.close();
    await fieldNameSelect.open();
    expect(
      await Promise.all((await fieldNameSelect.getOptions()).map((option) => option.getText())),
    ).toEqual(['Camel case', 'Snake case', 'Public feed']);
    await fieldNameSelect.close();
    const leagueInputs = await leaguesTab.getAllHarnesses(MatInputHarness);
    const columnsContent = [...element.querySelectorAll<HTMLElement>('[data-step-content]')].find(
      (content) => content.querySelector('h2')?.textContent === 'Choose columns',
    );
    const columnsNext = [
      ...(columnsContent?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((button) => button.textContent.includes('Next'));
    await leagueInputs[4].setValue('not valid');
    await leagueInputs[4].blur();
    await fixture.whenStable();
    expect(columnsNext?.disabled).toBe(true);
    await leagueInputs[4].setValue('league_name');
    await fixture.whenStable();
    expect(columnsNext?.disabled).toBe(false);
    expect(await fieldNameSelect.getValueText()).toBe('Custom (modified)');
    expect(await visibilitySelect.getValueText()).toBe('Default');
    await leagueInputs[4].setValue('name');
    await fixture.whenStable();
    expect(await fieldNameSelect.getValueText()).toBe('Camel case');
    const teamCount = await leaguesTab.getHarness(MatCheckboxHarness.with({ label: 'Team count' }));
    await teamsTab.select();
    const playerCount = await teamsTab.getHarness(
      MatCheckboxHarness.with({ label: 'Player count' }),
    );
    const playersTab = (await columnTabGroup.getTabs({ label: 'Players' }))[0];
    await playersTab.select();
    await leaguesTab.select();
    const sourceUrls = await loader.getAllHarnesses(
      MatCheckboxHarness.with({ label: 'Source page' }),
    );
    const createdAt = await loader.getAllHarnesses(
      MatCheckboxHarness.with({ label: 'Created at' }),
    );
    const updatedAt = await loader.getAllHarnesses(
      MatCheckboxHarness.with({ label: 'Updated at' }),
    );
    expect(await teamCount.isChecked()).toBe(false);
    expect(await playerCount.isChecked()).toBe(false);
    expect(await Promise.all(sourceUrls.map((checkbox) => checkbox.isChecked()))).toEqual([
      false,
      false,
      false,
    ]);
    expect(await Promise.all(createdAt.map((checkbox) => checkbox.isChecked()))).toEqual([
      false,
      false,
      false,
    ]);
    expect(await Promise.all(updatedAt.map((checkbox) => checkbox.isChecked()))).toEqual([
      false,
      false,
      false,
    ]);
    await teamCount.check();
    await fixture.whenStable();
    expect(await visibilitySelect.getValueText()).toBe('Custom (modified)');
    expect(await fieldNameSelect.getValueText()).toBe('Camel case');
    await teamsTab.select();
    await playerCount.check();
    await fixture.whenStable();
    expect(await visibilitySelect.getValueText()).toBe('Custom (modified)');
    await playerCount.uncheck();
    await fixture.whenStable();
    expect(await visibilitySelect.getValueText()).toBe('Custom (modified)');
    await leaguesTab.select();
    await teamCount.uncheck();
    await fixture.whenStable();
    expect(await visibilitySelect.getValueText()).toBe('Default');

    await stepper.selectStep({ label: 'Folder' });
    const chooseFolder = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Choose folder'),
    );
    chooseFolder?.click();
    await fixture.whenStable();

    await stepper.selectStep({ label: 'Leagues' });
    const championship = await loader.getHarness(
      MatCheckboxHarness.with({ label: 'Select Championship' }),
    );
    const leagueList = element.querySelector<HTMLUListElement>('[data-league-options]');
    const leagueRows = [
      ...(leagueList?.querySelectorAll<HTMLLIElement>('[data-league-option]') ?? []),
    ];
    expect(leagueList?.tagName).toBe('UL');
    expect(leagueList?.querySelector('table')).toBeNull();
    expect(leagueRows).toHaveLength(2);
    expect(leagueRows[0]?.querySelector('[data-league-name]')?.textContent).toBe('Premier League');
    expect(leagueRows[0]?.querySelector('[data-league-metadata]')?.textContent).toContain(
      'EnglandTransfermarktTier 1',
    );
    expect(leagueRows[1]?.querySelector('[data-league-metadata]')?.textContent).toContain(
      'Country not setSoccerwayTier not set',
    );
    const flag = leagueRows[0]?.querySelector<HTMLImageElement>('app-country-flag img');
    expect(flag?.getAttribute('src')).toContain('flags/20x15/gb-eng.png');
    expect(flag?.alt).toBe('');
    expect(element.textContent).not.toContain('GB1');
    expect(element.textContent).not.toContain('GB2');
    leagueRows[1]?.click();
    await fixture.whenStable();
    expect(await championship.isChecked()).toBe(true);
    await championship.uncheck();
    await stepper.selectStep({ label: 'Summary' });
    expect(element.textContent).toContain('Single JSON');

    const exportButton = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Export files'),
    );
    exportButton?.click();
    await fixture.whenStable();

    expect(api.chooseExportDirectory).toHaveBeenCalledOnce();
    expect(api.exportProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-id',
        dataset: 'source',
        format: 'single-json',
        destination: '/exports',
        includeTeamsWithoutLeague: false,
        leagueIds: ['league-1'],
        columns: expect.any(Object),
        fieldNames: expect.objectContaining({ nameStyle: 'camelCase' }),
      }),
    );
    expect(api.updateExportConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'source',
        format: 'single-json',
        columns: expect.any(Object),
        fieldNames: expect.objectContaining({ nameStyle: 'camelCase' }),
      }),
    );
    const requestedColumns = api.exportProject.mock.calls[0][0].columns;
    expect(requestedColumns.leagues).toEqual(
      expect.not.arrayContaining(['projectId', 'sourceUrl', 'teamCount', 'createdAt', 'updatedAt']),
    );
    expect(requestedColumns.teams).toEqual(
      expect.not.arrayContaining([
        'projectId',
        'sourceUrl',
        'playerCount',
        'createdAt',
        'updatedAt',
      ]),
    );
    expect(requestedColumns.players).toEqual(
      expect.not.arrayContaining(['projectId', 'sourceUrl', 'createdAt', 'updatedAt']),
    );
    expect(requestedColumns.teams).toEqual(
      expect.arrayContaining(['countryName', 'countryCode2', 'countryCode3']),
    );
    expect(requestedColumns.players).toContain('positionDetail');
    expect(element.textContent).toContain('Export complete');
    expect(element.textContent).toContain('1 file created');
    expect(confetti.celebrate).toHaveBeenCalledOnce();
    expect((await axe.run(element)).violations).toEqual([]);
  }, 15_000);

  it('restores global export choices while keeping the route-specific Source DB dataset', async () => {
    const columns = defaultExportColumns();
    columns.leagues = ['name'];
    const fieldNames = snakeCaseExportFieldNames();
    const leagueName = fieldNames.leagues.find(({ sourceKey }) => sourceKey === 'name');
    if (!leagueName) throw new Error('Missing league name field.');
    leagueName.outputName = 'competition_name';
    const configuration: ExportConfigurationPreference = {
      dataset: 'combined',
      format: 'csv',
      columns,
      fieldNames,
    };
    const listEntityFilterOptions = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          entity: 'teams' as const,
          leagues: [],
          hasTeamsWithoutLeague: false,
          seasons: [],
        },
      }),
    );
    const listCombinedEntities = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { rows: [], total: 0, pageIndex: 0, pageSize: 200 },
      }),
    );
    const api = {
      ...presetApi(),
      getExportVisibilityPresets: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: [{ id: 'custom-public', name: 'Public fields', columns }],
        }),
      ),
      getExportConfiguration: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: configuration }),
      ),
      listEntityFilterOptions,
      listCombinedEntities,
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const format = await loader.getHarness(
      MatRadioGroupHarness.with({ selector: '[aria-label="Export format"]' }),
    );
    const visibility = await loader.getHarness(
      MatSelectHarness.with({ selector: '[aria-label="Export visibility preset"]' }),
    );
    const names = await loader.getHarness(
      MatSelectHarness.with({ selector: '[aria-label="Export field-name preset"]' }),
    );

    expect(await format.getCheckedValue()).toBe('csv');
    expect(await visibility.getValueText()).toBe('Public fields');
    expect(await names.getValueText()).toBe('Custom (modified)');
    expect(listCombinedEntities).not.toHaveBeenCalled();
    expect(listEntityFilterOptions).toHaveBeenCalledWith({
      projectId: 'project-id',
      entity: 'teams',
    });
  });

  it('loads canonical leagues and teams for the fixed Combined DB export route', async () => {
    const listEntityFilterOptions = vi.fn();
    const listCombinedEntities = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { rows: [], total: 0, pageIndex: 0, pageSize: 200 },
      }),
    );
    const api = {
      ...presetApi(),
      getExportConfiguration: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            dataset: 'source' as const,
            format: 'json' as const,
            columns: defaultExportColumns(),
            fieldNames: snakeCaseExportFieldNames(),
          },
        }),
      ),
      listEntityFilterOptions,
      listCombinedEntities,
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) },
            },
            snapshot: { data: { dataset: 'combined' } },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Combined DB');
    expect(listCombinedEntities).toHaveBeenCalledTimes(2);
    expect(listEntityFilterOptions).not.toHaveBeenCalled();
  });

  it('does not replace remembered choices after a failed export', async () => {
    const api = {
      ...presetApi(),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            entity: 'teams' as const,
            leagues: [],
            hasTeamsWithoutLeague: false,
            seasons: [],
          },
        }),
      ),
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: '/exports' })),
      exportProject: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'FILESYSTEM' as const, message: 'Export failed.' },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Summary' });
    const element = fixture.nativeElement as HTMLElement;
    const exportButton = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Export files'),
    );
    exportButton?.click();
    await fixture.whenStable();

    expect(api.updateExportConfiguration).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Export failed.');
    expect(element.textContent).not.toContain('Export complete');
  });

  it('keeps a successful export visible when remembering its choices fails', async () => {
    const api = {
      ...presetApi(),
      updateExportConfiguration: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'DATABASE' as const, message: 'Preferences are unavailable.' },
        }),
      ),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            entity: 'teams' as const,
            leagues: [],
            hasTeamsWithoutLeague: false,
            seasons: [],
          },
        }),
      ),
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: '/exports' })),
      exportProject: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            directory: '/exports/snapshot',
            files: ['/exports/snapshot/snapshot.json'],
          },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Summary' });
    const element = fixture.nativeElement as HTMLElement;
    const exportButton = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Export files'),
    );
    exportButton?.click();
    await fixture.whenStable();

    expect(element.textContent).toContain('Export complete');
    expect(element.textContent).toContain('1 file created');
    expect(element.textContent).toContain(
      'Export completed, but your export choices could not be remembered: Preferences are unavailable.',
    );
  });

  it('keeps the folder step incomplete when the picker is canceled', async () => {
    const api = {
      ...presetApi(),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            entity: 'teams' as const,
            leagues: [],
            hasTeamsWithoutLeague: false,
            seasons: [],
          },
        }),
      ),
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
      chooseExportDirectory: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Folder' });
    const element = fixture.nativeElement as HTMLElement;
    const chooseFolder = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Choose folder'),
    );
    chooseFolder?.click();
    await fixture.whenStable();

    const folderStep = (await stepper.getSteps({ label: 'Folder' }))[0];
    expect(await folderStep.isCompleted()).toBe(false);
    expect(element.textContent).toContain('No folder selected');
  });

  it('restores a remembered folder and keeps it selected when changing it is canceled', async () => {
    const api = {
      ...presetApi(),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            entity: 'teams' as const,
            leagues: [],
            hasTeamsWithoutLeague: false,
            seasons: [],
          },
        }),
      ),
      getExportDestination: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: '/remembered/exports' }),
      ),
      chooseExportDirectory: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
      exportProject: vi.fn((request: ExportRequest) =>
        Promise.resolve({
          ok: true as const,
          value: {
            directory: `${request.destination}/snapshot`,
            files: [`${request.destination}/snapshot/snapshot.json`],
          },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Folder' });
    const element = fixture.nativeElement as HTMLElement;
    const folderStep = (await stepper.getSteps({ label: 'Folder' }))[0];
    const changeFolder = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Change folder'),
    );
    const folderNext = [
      ...(changeFolder
        ?.closest('[data-step-content]')
        ?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ].find((button) => button.textContent.includes('Next'));

    expect(element.textContent).toContain('/remembered/exports');
    expect(folderNext?.disabled).toBe(false);
    changeFolder?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('/remembered/exports');

    await stepper.selectStep({ label: 'Leagues' });
    expect(await folderStep.isCompleted()).toBe(true);
    await stepper.selectStep({ label: 'Summary' });
    const exportButton = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Export files'),
    );
    exportButton?.click();
    await fixture.whenStable();

    expect(api.getExportDestination).toHaveBeenCalledOnce();
    expect(api.chooseExportDirectory).toHaveBeenCalledOnce();
    expect(api.exportProject).toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/remembered/exports' }),
    );
  });

  it('resolves a legacy league record whose name is only its source ID', async () => {
    const api = {
      ...presetApi(),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            entity: 'teams' as const,
            leagues: [
              {
                id: 'league-1',
                sourceName: 'transfermarkt' as const,
                sourceId: 'GB1',
                name: 'GB1',
              },
            ],
            hasTeamsWithoutLeague: false,
            seasons: [],
          },
        }),
      ),
      getExportDestination: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
      previewLeague: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            sourceId: 'GB1',
            name: 'Premier League',
            sourceUrl: 'https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1',
            teams: [],
          },
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: [
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExportPage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const stepper = await loader.getHarness(MatStepperHarness);
    await stepper.selectStep({ label: 'Leagues' });
    const resolvedLeague = await loader.getHarness(
      MatCheckboxHarness.with({ label: 'Select Premier League' }),
    );

    expect(await resolvedLeague.isChecked()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('GB1');
    expect(api.previewLeague).toHaveBeenCalledWith({
      sourceName: 'transfermarkt',
      identifierOrUrl: 'GB1',
    });
  });
});
