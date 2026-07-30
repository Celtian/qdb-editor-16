import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import axe from 'axe-core';
import type {
  DatabaseDescriptor,
  ImportCandidate,
  ProjectDescriptor,
  TablePage,
  ValidationReport,
} from '../../../shared/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from '../core/app-store';
import { DesktopApi } from '../core/desktop-api';
import { ExportPage } from './export/export-page';
import { ImportPage } from './import/import-page';
import { ProjectFormPage } from './projects/project-form-page';
import { RowEditorPage } from './row-editor/row-editor-page';
import { TableEditorPage } from './table-editor/table-editor-page';
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

const route = (parameters: Record<string, string>) => ({
  snapshot: { paramMap: convertToParamMap(parameters) },
});

const providers = (api: Partial<DesktopApi>, parameters: Record<string, string>) => [
  provideRouter([]),
  provideNoopAnimations(),
  AppStore,
  { provide: DesktopApi, useValue: { onProgress: () => () => undefined, ...api } },
  { provide: ActivatedRoute, useValue: route(parameters) },
  {
    provide: MatDialog,
    useValue: { open: vi.fn() },
  },
];

afterEach(() => TestBed.resetTestingModule());

describe('project and import flows', () => {
  it('creates a dated project through Material form controls', async () => {
    const createProject = vi.fn(async () => project);
    TestBed.configureTestingModule({
      imports: [ProjectFormPage],
      providers: providers(
        {
          createProject,
          listProjects: vi.fn(async () => [project]),
        },
        {},
      ),
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
      providers: providers(
        {
          selectTextSource: vi.fn(async () => candidate),
          importDatabase,
          listDatabases: vi.fn(async () => [database]),
        },
        { projectId },
      ),
    });
    const fixture = TestBed.createComponent(ImportPage);
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
  it('keeps one inline row draft and saves it explicitly', async () => {
    const page: TablePage = {
      table: 'players',
      fields: [{ name: 'playerid', type: 'int', defaultValue: 0, unique: true }],
      rows: [{ rowId: 7, rowOrder: 0, values: { playerid: 7 } }],
      total: 1,
    };
    const saveRow = vi.fn(async () => ({ row: page.rows[0]!, warnings: [] }));
    TestBed.configureTestingModule({
      imports: [TableEditorPage],
      providers: providers(
        {
          readTable: vi.fn(async () => page),
          saveRow,
        },
        { projectId, databaseId, table: 'players' },
      ),
    });
    const fixture = TestBed.createComponent(TableEditorPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenRenderingDone();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('playerid');
    });
    const loader = TestbedHarnessEnvironment.loader(fixture);
    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: 'button[aria-label="Edit row inline"]' }),
      )
    ).click();
    fixture.detectChanges();
    await (await loader.getHarness(MatInputHarness.with({ selector: 'td input' }))).setValue('9');
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: 'button[aria-label="Save row"]' }))
    ).click();
    await fixture.whenStable();

    expect(saveRow).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 7, values: { playerid: 9 } }),
    );
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('creates a row through the responsive full-row form', async () => {
    const saveRow = vi.fn(async () => ({
      row: { rowId: 8, rowOrder: 1, values: { playerid: 8 } },
      warnings: [],
    }));
    TestBed.configureTestingModule({
      imports: [RowEditorPage],
      providers: providers(
        {
          listProjects: vi.fn(async () => [project]),
          listTables: vi.fn(async () => [
            {
              name: 'players',
              fields: [{ name: 'playerid', type: 'int' as const, defaultValue: 0, unique: true }],
              rowCount: 1,
              errorCount: 0,
              warningCount: 0,
            },
          ]),
          saveRow,
        },
        { projectId, databaseId, table: 'players' },
      ),
    });
    const fixture = TestBed.createComponent(RowEditorPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenRenderingDone();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('playerid');
    });
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const input = await loader.getHarness(MatInputHarness);
    await input.setValue('8');
    await (await loader.getHarness(MatButtonHarness.with({ text: /Save row/ }))).click();
    await fixture.whenStable();

    expect(saveRow).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId,
        table: 'players',
        values: { playerid: '8' },
        acceptWarnings: false,
      }),
    );
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
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
      providers: providers(
        {
          getValidation: vi.fn(async () => report),
          validateDatabase,
          listTables: vi.fn(async () => []),
        },
        { projectId, databaseId },
      ),
    });
    const fixture = TestBed.createComponent(ValidationPage);
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
      providers: providers(
        {
          getValidation: vi.fn(async () => report),
          selectExportDirectory: vi.fn(async () => 'C:\\exports'),
          exportDatabase,
          revealExport,
        },
        { projectId, databaseId },
      ),
    });
    const fixture = TestBed.createComponent(ExportPage);
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
