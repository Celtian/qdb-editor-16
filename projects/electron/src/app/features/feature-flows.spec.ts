import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import axe from 'axe-core';
import type {
  DatabaseDescriptor,
  ImportCandidate,
  ProjectDescriptor,
  TableDescriptor,
  TablePage,
  ValidationReport,
} from '../../../shared/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../core/app-store';
import { DesktopApi } from '../core/desktop-api';
import { DatabasesPage } from './databases/databases-page';
import { ExportPage } from './export/export-page';
import { ImportPage } from './import/import-page';
import { ProjectFormPage } from './projects/project-form-page';
import { TableEditorPage } from './table-editor/table-editor-page';
import { TablesPage } from './tables/tables-page';
import { ValidationPage } from './validation/validation-page';

const projectId = '11111111-1111-4111-8111-111111111111';
const databaseId = '22222222-2222-4222-8222-222222222222';
const now = '2026-07-30T00:00:00.000Z';

const project: ProjectDescriptor = {
  id: projectId,
  name: 'Career',
  referenceDate: '2015-08-01',
  createdAt: now,
  updatedAt: now,
  databaseCount: 1,
  sourceLeagueCount: 0,
  sourceTeamCount: 0,
  sourcePlayerCount: 0,
  combinedLeagueCount: 0,
  combinedTeamCount: 0,
  combinedPlayerCount: 0,
  sourceNames: [],
};

const report: ValidationReport = {
  databaseId,
  validatedAt: now,
  tablesChecked: 25,
  rowsChecked: 1,
  errorCount: 0,
  warningCount: 0,
  issues: [],
};

const database: DatabaseDescriptor = {
  id: databaseId,
  projectId,
  name: 'Main',
  fifaVersion: 16,
  source: { kind: 'blank', originalPaths: [], hashes: {}, importedAt: now },
  status: 'available',
  tableCount: 25,
  rowCount: 1,
  createdAt: now,
  updatedAt: now,
  validation: report,
};

const corruptDatabase: DatabaseDescriptor = {
  ...database,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Unreadable',
  status: 'corrupt',
  error: 'The database could not be opened.',
  validation: {
    validatedAt: now,
    errorCount: 1,
    warningCount: 0,
  },
};

const tables: TableDescriptor[] = [
  {
    name: 'competition',
    fields: [
      { name: 'competitionid', type: 'int', defaultValue: 0, unique: true },
      { name: 'competitionname', type: 'string', defaultValue: '', unique: false },
    ],
    rowCount: 72,
    errorCount: 0,
    warningCount: 0,
  },
  {
    name: 'dcplayernames',
    fields: [
      { name: 'nameid', type: 'int', defaultValue: 0, unique: true },
      { name: 'playername', type: 'string', defaultValue: '', unique: false },
    ],
    rowCount: 0,
    errorCount: 1,
    warningCount: 0,
  },
];

const providers = (api: Partial<DesktopApi>) => [
  provideRouter([]),
  provideNoopAnimations(),
  AppStore,
  { provide: DesktopApi, useValue: { onProgress: () => () => undefined, ...api } },
];

afterEach(() => TestBed.resetTestingModule());

describe('project and import flows', () => {
  it('renders centered status icons for database cards', async () => {
    TestBed.configureTestingModule({
      imports: [DatabasesPage],
      providers: providers({
        listProjects: vi.fn(async () => [project]),
        listDatabases: vi.fn(async () => [database, corruptDatabase]),
      }),
    });
    const fixture = TestBed.createComponent(DatabasesPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.detectChanges();
    await fixture.whenStable();
    let icons: (string | undefined)[] = [];
    await vi.waitFor(() => {
      fixture.detectChanges();
      icons = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('mat-icon'),
      ].map((icon) => icon.textContent?.trim());
      expect(icons.filter((icon) => icon === 'storage')).toHaveLength(2);
    });

    const cardIcons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        'mat-card-header .database-card-icon',
      ),
    ];
    expect(cardIcons.map((icon) => icon.textContent?.trim())).toEqual(['storage', 'error']);
    expect(cardIcons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(getComputedStyle(cardIcons[0]).alignItems).toBe('center');
    expect(getComputedStyle(cardIcons[0]).justifyContent).toBe('center');
    expect(icons).not.toContain('database');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('renders centered icons for table cards', async () => {
    TestBed.configureTestingModule({
      imports: [TablesPage],
      providers: providers({
        listProjects: vi.fn(async () => [project]),
        listDatabases: vi.fn(async () => [database]),
        listTables: vi.fn(async () => tables),
      }),
    });
    const fixture = TestBed.createComponent(TablesPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.detectChanges();
    await fixture.whenStable();

    let cardIcons: HTMLElement[] = [];
    await vi.waitFor(() => {
      fixture.detectChanges();
      cardIcons = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
          'mat-card-header .table-card-icon',
        ),
      ];
      expect(cardIcons).toHaveLength(2);
    });
    expect(cardIcons.map((icon) => icon.textContent?.trim())).toEqual(['table_view', 'table_view']);
    expect(cardIcons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(getComputedStyle(cardIcons[0]).alignItems).toBe('center');
    expect(getComputedStyle(cardIcons[0]).justifyContent).toBe('center');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('creates a dated project through Material form controls', async () => {
    const createProject = vi.fn(async () => project);
    TestBed.configureTestingModule({
      imports: [ProjectFormPage],
      providers: providers({
        createProject,
        listProjects: vi.fn(async () => [project]),
      }),
    });
    const fixture = TestBed.createComponent(ProjectFormPage);
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const inputs = await loader.getAllHarnesses(MatInputHarness);
    await inputs[0]!.setValue('Career');
    await inputs[1]!.setValue('2015-08-01');
    await (await loader.getHarness(MatButtonHarness.with({ text: /Save project/ }))).click();
    await fixture.whenStable();

    expect(createProject).toHaveBeenCalledWith({
      name: 'Career',
      referenceDate: '2015-08-01',
    });
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('inspects and imports a DB Master text folder', async () => {
    const candidate: ImportCandidate = {
      selectionId: 'selection',
      suggestedName: 'Imported career',
      sourceKind: 'text-folder',
      originalPaths: ['C:\\fifa16'],
      tables: [{ table: 'players', rows: 1 }],
      unsupportedTables: [],
      warnings: [],
    };
    const importDatabase = vi.fn(async () => ({ database, validation: report }));
    TestBed.configureTestingModule({
      imports: [ImportPage],
      providers: providers({
        selectTextSource: vi.fn(async () => candidate),
        importDatabase,
        listDatabases: vi.fn(async () => [database]),
      }),
    });
    const fixture = TestBed.createComponent(ImportPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.detectChanges();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mat-stepper')?.getAttribute('aria-label')).toBe(
      'Database import wizard',
    );
    expect(
      [...element.querySelectorAll('.mat-step-icon-content')].map((icon) => icon.textContent),
    ).toEqual(['1', '2', '3']);
    await (await loader.getHarness(MatButtonHarness.with({ text: /^Next$/ }))).click();
    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: '[aria-label="Select text folder"]' }),
      )
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    await (await loader.getHarness(MatButtonHarness.with({ text: /Review import/ }))).click();
    const input = await loader.getHarness(MatInputHarness.with({ selector: '.name-field input' }));
    expect(await input.getValue()).toBe('Imported career');
    await (await loader.getHarness(MatButtonHarness.with({ text: /Import database/ }))).click();
    await fixture.whenStable();

    expect(importDatabase).toHaveBeenCalledWith({
      projectId,
      selectionId: 'selection',
      name: 'Imported career',
    });
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
});

describe('editing and validation flows', () => {
  it('creates and edits rows through an accessible right drawer', async () => {
    const page: TablePage = {
      table: 'players',
      fields: [
        { name: 'playerid', type: 'int', defaultValue: 0, unique: true },
        { name: 'height', type: 'float', defaultValue: 1.75, unique: false },
        { name: 'lastname', type: 'string', defaultValue: '', unique: false },
      ],
      rows: [
        {
          rowId: 7,
          rowOrder: 0,
          values: { playerid: 7, height: 1.8, lastname: 'Smith' },
        },
      ],
      total: 1,
    };
    const saveRow = vi.fn(async () => ({ row: page.rows[0]!, warnings: [] }));
    TestBed.configureTestingModule({
      imports: [TableEditorPage],
      providers: providers({
        readTable: vi.fn(async () => page),
        saveRow,
      }),
    });
    const fixture = TestBed.createComponent(TableEditorPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.componentRef.setInput('table', 'players');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenRenderingDone();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('playerid');
    });
    const table = fixture.nativeElement.querySelector('table') as HTMLTableElement;
    expect(table.querySelector('td input')).toBeNull();
    expect(table.querySelector('button[aria-label="Edit row inline"]')).toBeNull();
    expect(table.querySelector('th:last-child')?.classList).toContain('text-right');
    expect(table.querySelector('td:last-child > div')?.classList).toContain('justify-end');
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const documentLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);

    await (
      await loader.getHarness(MatButtonHarness.with({ selector: 'button[aria-label="Edit row"]' }))
    ).click();

    const drawer = await documentLoader.getHarness(MatDialogHarness);
    expect(await drawer.getRole()).toBe('dialog');
    expect(await drawer.getAriaLabelledby()).toBe('row-editor-title');
    const panel = document.querySelector<HTMLElement>('.row-editor-drawer-panel')!;
    expect(panel.style.height).toBe('100vh');
    expect(panel.parentElement?.style.justifyContent).toBe('flex-end');
    expect(panel.querySelector('button[aria-label="Close row editor"]')).toBeTruthy();
    expect((await axe.run(panel)).violations).toEqual([]);

    const editInput = await documentLoader.getHarness(
      MatInputHarness.with({ selector: '.row-editor-drawer-panel input[type="number"][step="1"]' }),
    );
    expect(await editInput.getValue()).toBe('7');
    expect(panel.querySelector<HTMLInputElement>('input[type="number"][step="any"]')?.value).toBe(
      '1.8',
    );
    expect(panel.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Smith');
    await editInput.setValue('4sadsa');
    expect(await editInput.getValue()).toBe('');
    expect(
      await (
        await documentLoader.getHarness(MatButtonHarness.with({ text: /Save row/ }))
      ).isDisabled(),
    ).toBe(true);
    await editInput.setValue('4.2');
    expect(
      await (
        await documentLoader.getHarness(MatButtonHarness.with({ text: /Save row/ }))
      ).isDisabled(),
    ).toBe(true);
    await editInput.setValue('9');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: /Save row/ }))).click();
    await fixture.whenStable();

    expect(saveRow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        databaseId,
        table: 'players',
        rowId: 7,
        values: { playerid: 9, height: 1.8, lastname: 'Smith' },
        acceptWarnings: false,
      }),
    );
    await vi.waitFor(() => expect(document.querySelector('.row-editor-drawer-panel')).toBeNull());

    await (await loader.getHarness(MatButtonHarness.with({ text: /Add row/ }))).click();
    const addInput = await documentLoader.getHarness(
      MatInputHarness.with({ selector: '.row-editor-drawer-panel input[type="number"][step="1"]' }),
    );
    expect(await addInput.getValue()).toBe('0');
    await addInput.setValue('8');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: /Save row/ }))).click();
    await fixture.whenStable();

    expect(saveRow).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        databaseId,
        table: 'players',
        values: { playerid: 8, height: 1.75, lastname: '' },
        acceptWarnings: false,
      }),
    );
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('loads the selected table when Angular reuses the editor for a new route parameter', async () => {
    const pages: Record<string, TablePage> = {
      players: {
        table: 'players',
        fields: [{ name: 'playerid', type: 'int', defaultValue: 0, unique: true }],
        rows: [],
        total: 0,
      },
      leagues: {
        table: 'leagues',
        fields: [{ name: 'leaguename', type: 'string', defaultValue: '', unique: true }],
        rows: [],
        total: 0,
      },
    };
    const readTable = vi.fn(async ({ table }: { table: string }) => pages[table]!);
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter(
          [
            {
              path: 'projects/:projectId/fifa/:databaseId/tables/:table',
              component: TableEditorPage,
            },
          ],
          withComponentInputBinding(),
        ),
        AppStore,
        {
          provide: DesktopApi,
          useValue: { onProgress: () => () => undefined, readTable },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    const routeRoot = `/projects/${projectId}/fifa/${databaseId}/tables`;
    const playersEditor = await harness.navigateByUrl(`${routeRoot}/players`, TableEditorPage);
    await vi.waitFor(() => expect(harness.routeNativeElement?.textContent).toContain('playerid'));

    const leaguesEditor = await harness.navigateByUrl(`${routeRoot}/leagues`, TableEditorPage);
    await vi.waitFor(() => expect(harness.routeNativeElement?.textContent).toContain('leaguename'));

    expect(leaguesEditor).toBe(playersEditor);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('leagues');
    expect(readTable).toHaveBeenLastCalledWith(
      expect.objectContaining({ databaseId, table: 'leagues' }),
    );
  });

  it('renders and refreshes a full validation report', async () => {
    const validateDatabase = vi.fn(async () => ({
      ...report,
      warningCount: 1,
      issues: [
        {
          severity: 'warning' as const,
          table: 'players',
          field: 'overallrating',
          message: 'Outside published range.',
          occurrences: 1,
          samples: [{ rowId: 7, value: 100 }],
        },
      ],
    }));
    TestBed.configureTestingModule({
      imports: [ValidationPage],
      providers: providers({
        getValidation: vi.fn(async () => report),
        validateDatabase,
        listTables: vi.fn(async () => []),
      }),
    });
    const fixture = TestBed.createComponent(ValidationPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.detectChanges();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    await (await loader.getHarness(MatButtonHarness.with({ text: /Validate now/ }))).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(validateDatabase).toHaveBeenCalledWith(databaseId);
    expect(fixture.nativeElement.textContent).toContain('1');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
});

describe('export flow', () => {
  it('selects a destination, exports all tables, and reveals the result', async () => {
    const exportDatabase = vi.fn(async () => ({
      databaseId,
      outputPath: 'C:\\exports\\qdb-editor-16-main',
    }));
    const revealExport = vi.fn(async () => true);
    TestBed.configureTestingModule({
      imports: [ExportPage],
      providers: providers({
        getValidation: vi.fn(async () => report),
        selectExportDirectory: vi.fn(async () => 'C:\\exports'),
        exportDatabase,
        revealExport,
      }),
    });
    const fixture = TestBed.createComponent(ExportPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.detectChanges();
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: 'button[aria-label="Select export folder"]' }),
      )
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    await (await loader.getHarness(MatButtonHarness.with({ text: /Export all tables/ }))).click();
    await fixture.whenStable();
    fixture.detectChanges();
    await (await loader.getHarness(MatButtonHarness.with({ text: /Reveal in folder/ }))).click();

    expect(exportDatabase).toHaveBeenCalledWith({
      databaseId,
      targetParentPath: 'C:\\exports',
    });
    expect(revealExport).toHaveBeenCalledWith('C:\\exports\\qdb-editor-16-main');
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
});
