import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TreeHarness, TreeItemHarness } from '@angular/aria/tree/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import axe from 'axe-core';
import type {
  DatabaseDescriptor,
  ProjectDescriptor,
  TableDescriptor,
} from '../../../shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  databaseCount: 2,
};

const tournamentProject: ProjectDescriptor = {
  ...project,
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Tournament',
  databaseCount: 0,
};

const makeDatabase = (id: string, name: string): DatabaseDescriptor => ({
  id,
  projectId: project.id,
  name,
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
});

const mainDatabase = makeDatabase('22222222-2222-4222-8222-222222222222', 'Main');
const alternateDatabase = makeDatabase('33333333-3333-4333-8333-333333333333', 'Alternate');
const tables: TableDescriptor[] = ['competition', 'players'].map((name) => ({
  name,
  fields: [],
  rowCount: 0,
  errorCount: 0,
  warningCount: 0,
}));

describe('AppNavigation', () => {
  let store: AppStore;
  let router: Router;
  let listDatabases: ReturnType<typeof vi.fn>;
  let listTables: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listDatabases = vi.fn(async (projectId: string) =>
      projectId === project.id ? [mainDatabase, alternateDatabase] : [],
    );
    listTables = vi.fn(async () => tables);
    TestBed.configureTestingModule({
      imports: [AppNavigation],
      providers: [
        provideNoopAnimations(),
        provideRouter([
          { path: 'projects', component: EmptyPage },
          { path: 'projects/:projectId', component: EmptyPage },
          {
            path: 'projects/:projectId/databases/:databaseId/tables/:table/rows/:rowId',
            component: EmptyPage,
          },
          {
            path: 'projects/:projectId/databases/:databaseId/tables/:table',
            component: EmptyPage,
          },
          {
            path: 'projects/:projectId/databases/:databaseId/tables',
            component: EmptyPage,
          },
          {
            path: 'projects/:projectId/databases/:databaseId/validation',
            component: EmptyPage,
          },
          {
            path: 'projects/:projectId/databases/:databaseId/export',
            component: EmptyPage,
          },
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
    store = TestBed.inject(AppStore);
    router = TestBed.inject(Router);
    await store.refreshProjects();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('uses the logo as the projects link and lazy-loads only an expanded project', async () => {
    await router.navigateByUrl('/projects');
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const tree = await loader.getHarness(TreeHarness);

    expect(element.querySelector('.brand[aria-current="page"]')).not.toBeNull();
    expect(await tree.getItems({ level: 1 })).toHaveLength(2);
    expect(element.textContent).not.toContain(mainDatabase.name);

    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${project.name} databases"]`)!
      .click();
    await fixture.whenStable();

    expect(listDatabases).toHaveBeenCalledOnce();
    expect(listDatabases).toHaveBeenCalledWith(project.id);
    expect(element.textContent).toContain(mainDatabase.name);
    expect(element.textContent).not.toContain('No databases in this project.');
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('loads table names on demand and navigates through tree values', async () => {
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);

    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${project.name} databases"]`)!
      .click();
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${mainDatabase.name} tools"]`)!
      .click();
    await fixture.whenStable();
    element
      .querySelector<HTMLButtonElement>(`button[aria-label="Expand ${mainDatabase.name} tables"]`)!
      .click();
    await fixture.whenStable();

    expect(listTables).toHaveBeenCalledOnce();
    expect(element.textContent).toContain('competition');
    const competition = await loader.getHarness(
      TreeItemHarness.with({ text: /competition/, level: 4 }),
    );
    await competition.click();
    await fixture.whenStable();

    expect(router.url).toBe(
      `/projects/${project.id}/databases/${mainDatabase.id}/tables/competition`,
    );
    expect(
      element.querySelector('li[role="treeitem"][aria-current="page"]')?.textContent,
    ).toContain('competition');
  });

  it('navigates project, database, tool, and logo destinations through the existing routes', async () => {
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);

    const projectItem = await loader.getHarness(
      TreeItemHarness.with({ text: new RegExp(project.name), level: 1 }),
    );
    await projectItem.click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}`);

    const databaseItem = await loader.getHarness(
      TreeItemHarness.with({ text: new RegExp(mainDatabase.name), level: 2 }),
    );
    await databaseItem.click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}/databases/${mainDatabase.id}/tables`);

    const validationItem = await loader.getHarness(
      TreeItemHarness.with({ text: /Validation/, level: 3 }),
    );
    await validationItem.click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}/databases/${mainDatabase.id}/validation`);

    const exportItem = await loader.getHarness(TreeItemHarness.with({ text: /Export/, level: 3 }));
    await exportItem.click();
    await fixture.whenStable();
    expect(router.url).toBe(`/projects/${project.id}/databases/${mainDatabase.id}/export`);

    element.querySelector<HTMLAnchorElement>('.brand')!.click();
    await fixture.whenStable();
    expect(router.url).toBe('/projects');
  });

  it('reveals non-table deep links without loading table names', async () => {
    await router.navigateByUrl(`/projects/${project.id}/databases/${mainDatabase.id}/validation`);
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(listDatabases).toHaveBeenCalledOnce();
    expect(listTables).not.toHaveBeenCalled();
    expect(element.querySelector('li[aria-current="page"]')?.textContent).toContain('Validation');

    await router.navigateByUrl(`/projects/${project.id}/databases/${mainDatabase.id}/export`);
    await fixture.whenStable();
    expect(listDatabases).toHaveBeenCalledOnce();
    expect(listTables).not.toHaveBeenCalled();
    expect(element.querySelector('li[aria-current="page"]')?.textContent).toContain('Export');

    await router.navigateByUrl(`/projects/${project.id}/databases/${mainDatabase.id}/tables`);
    await fixture.whenStable();
    expect(listTables).not.toHaveBeenCalled();
    expect(
      element.querySelector(`button[aria-label="Expand ${mainDatabase.name} tables"]`),
    ).not.toBeNull();
  });

  it('opens and loads the ancestors of a direct row-editor route', async () => {
    await router.navigateByUrl(
      `/projects/${project.id}/databases/${mainDatabase.id}/tables/players/rows/7`,
    );
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(listDatabases).toHaveBeenCalledWith(project.id);
    expect(listTables).toHaveBeenCalledWith(mainDatabase.id);
    expect(element.querySelector(`li[aria-current="page"]`)?.textContent).toContain('players');
    expect(
      element.querySelector(`button[aria-label="Collapse ${project.name} databases"]`),
    ).not.toBeNull();
    expect(
      element.querySelector(`button[aria-label="Collapse ${mainDatabase.name} tools"]`),
    ).not.toBeNull();
    expect(
      element.querySelector(`button[aria-label="Collapse ${mainDatabase.name} tables"]`),
    ).not.toBeNull();
  });

  it('supports arrow expansion, typeahead, and inline retry', async () => {
    listDatabases.mockRejectedValueOnce(new Error('Catalog unavailable'));
    const fixture = TestBed.createComponent(AppNavigation);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const projects = element.querySelectorAll<HTMLElement>('li[role="treeitem"][aria-level="1"]');

    projects[0]!.focus();
    projects[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(element.textContent).toContain('Catalog unavailable');

    element.querySelector<HTMLButtonElement>('.error-message button')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain(mainDatabase.name);

    projects[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain(tournamentProject.name);
    expect((await axe.run(element)).violations).toEqual([]);
  });
});
