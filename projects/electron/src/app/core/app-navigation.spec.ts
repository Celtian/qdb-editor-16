import { TreeHarness, TreeItemHarness } from '@angular/aria/tree/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';

import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DatabaseDescriptor,
  ProjectDescriptor,
  TableDescriptor,
} from '../../../shared/contracts';
import { AppNavigation } from './app-navigation';
import { AppStore } from './app-store';
import { DesktopApi } from './desktop-api';

@Component({ template: '' })
class EmptyPage {}

const project: ProjectDescriptor = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'FIFA16 2',
  referenceDate: '2015-08-01',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  databaseCount: 1,
  sourceLeagueCount: 2,
  sourceTeamCount: 3,
  sourcePlayerCount: 40,
  combinedLeagueCount: 1,
  combinedTeamCount: 2,
  combinedPlayerCount: 30,
  sourceNames: ['transfermarkt'],
};

const tournamentProject: ProjectDescriptor = {
  ...project,
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Tournament',
  databaseCount: 0,
};

const database: DatabaseDescriptor = {
  id: '22222222-2222-4222-8222-222222222222',
  projectId: project.id,
  name: 'Main',
  fifaVersion: 16,
  source: {
    kind: 'blank',
    originalPaths: [],
    hashes: {},
    importedAt: '2026-07-30T00:00:00.000Z',
  },
  status: 'available',
  tableCount: 25,
  rowCount: 0,
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  validation: {
    validatedAt: '2026-07-30T00:00:00.000Z',
    errorCount: 0,
    warningCount: 0,
  },
};

const tables: TableDescriptor[] = ['competition', 'players'].map((name) => ({
  name,
  fields: [],
  rowCount: 0,
  errorCount: 0,
  warningCount: 0,
}));

describe('AppNavigation', () => {
  let router: Router;
  let listDatabases: ReturnType<typeof vi.fn>;
  let listTables: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listDatabases = vi.fn(async (projectId: string) =>
      projectId === project.id ? [database] : [],
    );
    listTables = vi.fn(async () => tables);
    TestBed.configureTestingModule({
      imports: [AppNavigation],
      providers: [
        provideNoopAnimations(),
        provideRouter([
          { path: 'projects', component: EmptyPage },
          { path: 'projects/:projectId', component: EmptyPage },
          { path: 'projects/:projectId/source/import', component: EmptyPage },
          { path: 'projects/:projectId/source/objects/:kind', component: EmptyPage },
          { path: 'projects/:projectId/source/export', component: EmptyPage },
          { path: 'projects/:projectId/combined/import', component: EmptyPage },
          { path: 'projects/:projectId/combined/objects/:kind', component: EmptyPage },
          { path: 'projects/:projectId/combined/export', component: EmptyPage },
          { path: 'projects/:projectId/fifa', component: EmptyPage },
          {
            path: 'projects/:projectId/fifa/:databaseId/tables/:table/rows/:rowId',
            component: EmptyPage,
          },
          { path: 'projects/:projectId/fifa/:databaseId/tables/:table', component: EmptyPage },
          { path: 'projects/:projectId/fifa/:databaseId/tables', component: EmptyPage },
          { path: 'projects/:projectId/fifa/:databaseId/objects/:kind', component: EmptyPage },
          { path: 'projects/:projectId/fifa/:databaseId/settings', component: EmptyPage },
          { path: 'projects/:projectId/fifa/:databaseId/validation', component: EmptyPage },
          { path: 'projects/:projectId/fifa/:databaseId/export', component: EmptyPage },
          { path: 'settings', component: EmptyPage },
        ]),
        {
          provide: DesktopApi,
          useValue: {
            onProgress: () => () => undefined,
            listProjects: vi.fn(async () => [project, tournamentProject]),
            listDatabases,
            listTables,
          },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    router = TestBed.inject(Router);
    await TestBed.inject(AppStore).refreshProjects();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows the requested three database branches without eagerly loading FIFA databases', async () => {
    await router.navigateByUrl('/projects');
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const tree = await loader.getHarness(TreeHarness);

    expect(element.querySelector('.qdb-brand[aria-current="page"]')).not.toBeNull();
    expect(await tree.getItems({ level: 1 })).toHaveLength(2);
    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${project.name}"]`)!
      .click();
    await fixture.whenStable();

    expect(element.textContent).toContain('Source DB');
    expect(element.textContent).toContain('Combined DB');
    expect(element.textContent).toContain('FIFA DB');
    const fifaDisclosure = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand FIFA DB"]',
    );
    expect(
      fifaDisclosure?.parentElement?.querySelector<HTMLElement>(':scope > mat-icon')?.textContent,
    ).toContain('storage');
    expect(listDatabases).not.toHaveBeenCalled();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('navigates Source DB and Combined DB object nodes', async () => {
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);

    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${project.name}"]`)!
      .click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('button[aria-label="Expand Source DB"]')!.click();
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Expand Source DB objects"]')!
      .click();
    await fixture.whenStable();

    await (await loader.getHarness(TreeItemHarness.with({ text: /Teams/, level: 4 }))).click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}/source/objects/teams`);

    element.querySelector<HTMLButtonElement>('button[aria-label$="Combined DB"]')!.click();
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Expand Combined DB objects"]')!
      .click();
    await fixture.whenStable();
    const combinedPlayers = await loader.getAllHarnesses(
      TreeItemHarness.with({ text: /Players/, level: 4 }),
    );
    await combinedPlayers.at(-1)!.click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}/combined/objects/players`);
  });

  it('loads FIFA databases and table names only when their branches expand', async () => {
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);

    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${project.name}"]`)!
      .click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('button[aria-label="Expand FIFA DB"]')!.click();
    await fixture.whenStable();
    expect(listDatabases).toHaveBeenCalledWith(project.id);

    element.querySelector<HTMLButtonElement>('button[aria-label="Expand Main"]')!.click();
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>('button[aria-label="Toggle FIFA database tables"]')!
      .click();
    await fixture.whenStable();
    expect(listTables).toHaveBeenCalledWith(database.id);

    await (
      await loader.getHarness(TreeItemHarness.with({ text: /competition/, level: 5 }))
    ).click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}/fifa/${database.id}/tables/competition`);
  });

  it('reveals a direct FIFA deep link and loads its ancestors', async () => {
    await router.navigateByUrl(`/projects/${project.id}/fifa/${database.id}/tables/players/rows/7`);
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(listDatabases).toHaveBeenCalledWith(project.id);
    expect(listTables).toHaveBeenCalledWith(database.id);
    expect(element.querySelector('li[aria-current="page"]')?.textContent).toContain('players');
    expect(element.querySelector('button[aria-label="Collapse FIFA DB"]')).not.toBeNull();
  });

  it('shows inline FIFA loading errors and supports retry', async () => {
    listDatabases.mockRejectedValueOnce(new Error('Catalog unavailable'));
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${project.name}"]`)!
      .click();
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>('button[aria-label="Expand FIFA DB"]')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Catalog unavailable');

    element.querySelector<HTMLButtonElement>('.qdb-error-message button')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain(database.name);
  });
});
