import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatInputHarness } from '@angular/material/input/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DatabaseDescriptor,
  ObjectDetail,
  ProjectDescriptor,
} from '../../../../shared/contracts';
import { cloneDefaultDatabaseObjectSettings } from '../../../../shared/object-settings';
import { AppStore } from '../../core/app-store';
import { DesktopApi } from '../../core/desktop-api';
import { ObjectSettingsPage } from '../object-settings/object-settings-page';
import { ObjectDetailPage } from './object-detail-page';
import { ObjectListPage } from './object-list-page';

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
  validation: { validatedAt: now, errorCount: 0, warningCount: 0 },
};

const providers = (api: Partial<DesktopApi>) => [
  provideRouter([]),
  provideNoopAnimations(),
  AppStore,
  {
    provide: DesktopApi,
    useValue: {
      onProgress: () => () => undefined,
      listProjects: vi.fn(async () => [project]),
      listDatabases: vi.fn(async () => [database]),
      listTables: vi.fn(async () => []),
      getDatabaseObjectSettings: vi.fn(async () => cloneDefaultDatabaseObjectSettings()),
      ...api,
    },
  },
];

afterEach(() => TestBed.resetTestingModule());

describe('object editor flows', () => {
  it('renders a searchable player object list without placeholder CRUD actions', async () => {
    TestBed.configureTestingModule({
      imports: [ObjectListPage],
      providers: providers({
        listObjects: vi.fn(async () => ({
          kind: 'players' as const,
          total: 1,
          items: [
            {
              id: 1,
              name: 'Petr Čech',
              values: {
                country: 'Czech Republic',
                birthdate: 150000,
                height: 197,
                weight: 90,
              },
            },
          ],
        })),
      }),
    });
    const fixture = TestBed.createComponent(ObjectListPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.componentRef.setInput('kind', 'players');
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain('Petr Čech');
    });
    expect(element.textContent).toContain('Player creation and deletion');
    expect(element.querySelector('[aria-label^="Actions for"]')).toBeNull();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('edits and saves a player detail section through Signal Form controls', async () => {
    const detail: ObjectDetail = {
      kind: 'players',
      id: 1,
      title: 'Petr Čech',
      section: 'identity',
      fields: [
        {
          name: 'height',
          type: 'int',
          defaultValue: 180,
          unique: false,
          range: { min: 150, max: 215 },
        },
      ],
      values: { height: 197 },
      relationIds: [],
      related: [],
      readOnly: false,
    };
    const saveObject = vi.fn(async () => ({ id: 1, warnings: [] }));
    TestBed.configureTestingModule({
      imports: [ObjectDetailPage],
      providers: providers({
        readObject: vi.fn(async () => detail),
        saveObject,
      }),
    });
    const fixture = TestBed.createComponent(ObjectDetailPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.componentRef.setInput('kind', 'players');
    fixture.componentRef.setInput('id', 1);
    fixture.componentRef.setInput('section', 'identity');
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Petr Čech');
    });
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const input = await loader.getHarness(MatInputHarness);

    await input.setValue('198');
    await (await loader.getHarness(MatButtonHarness.with({ text: /Save/ }))).click();
    await fixture.whenStable();

    expect(saveObject).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId,
        kind: 'players',
        id: 1,
        section: 'identity',
        values: { height: 198 },
      }),
    );
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });

  it('edits database-scoped object settings with accessible labeled controls', async () => {
    const saveDatabaseObjectSettings: DesktopApi['saveDatabaseObjectSettings'] = vi.fn(
      async (_id, settings) => settings,
    );
    TestBed.configureTestingModule({
      imports: [ObjectSettingsPage],
      providers: providers({ saveDatabaseObjectSettings }),
    });
    const fixture = TestBed.createComponent(ObjectSettingsPage);
    fixture.componentRef.setInput('projectId', projectId);
    fixture.componentRef.setInput('databaseId', databaseId);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('League');
    });
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const inputs = await loader.getAllHarnesses(MatInputHarness);

    await inputs[0]?.setValue('500');
    await (await loader.getHarness(MatButtonHarness.with({ text: /Save settings/ }))).click();
    await fixture.whenStable();

    expect(saveDatabaseObjectSettings).toHaveBeenCalledWith(
      databaseId,
      expect.objectContaining({ ids: expect.objectContaining({ league: 500 }) }),
    );
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
});
