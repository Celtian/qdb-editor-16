import { TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { type DebugElement, getDebugNode } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatChipGridHarness } from '@angular/material/chips/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortHarness } from '@angular/material/sort/testing';
import { MatTableHarness } from '@angular/material/table/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import axe from 'axe-core';
import { provideNullable } from 'ngx-nullable';
import { BehaviorSubject, of } from 'rxjs';

import type {
  Entity,
  EntityFilterOptions,
  EntityKind,
  League,
  PageRequest,
  Player,
  ProjectSummary,
  Result,
  Team,
} from '../../../../../shared/downloader/contracts';
import { formatUiTimestamp } from '../../../../../shared/downloader/ui-format';
import { DesktopApi } from '../../../core/downloader-api';
import { ENTITY_STATUS_SETTINGS_STORAGE_KEY } from '../../../core/entity-status-settings.service';
import { entityColumnPreferenceKey } from './entity-column-preferences';
import { entityFilterPreferenceKey } from './entity-filter-preferences';
import { EntityTablePage } from './entity-table-page';

interface PageSetup {
  entity: EntityKind;
  options: EntityFilterOptions;
  referenceDate?: string;
  initialQuery?: Record<string, string | string[]>;
  rows?: Entity[];
  rowsAfterDelete?: Entity[];
  rowsAfterUpdate?: Entity[];
  total?: number;
  deleteLeagueResult?: Result<ProjectSummary>;
  deleteLeaguesResult?: Result<ProjectSummary>;
  deleteTeamResult?: Result<ProjectSummary>;
  deleteTeamsResult?: Result<ProjectSummary>;
  deletePlayerResult?: Result<ProjectSummary>;
  deletePlayersResult?: Result<ProjectSummary>;
  updateLeagueCountriesResult?: Result<ProjectSummary>;
  updateLeagueTiersResult?: Result<ProjectSummary>;
  updateTeamCountriesResult?: Result<ProjectSummary>;
}

const projectSummary = (referenceDate = '2026-01-01'): ProjectSummary => ({
  id: 'project-id',
  name: 'Project',
  referenceDate,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  leagueCount: 1,
  teamCount: 0,
  playerCount: 0,
  sourceNames: [],
});

const createPage = async ({
  entity,
  options,
  referenceDate = '2026-01-01',
  initialQuery = {},
  rows = [],
  rowsAfterDelete = rows,
  rowsAfterUpdate = rows,
  total = rows.length,
  deleteTeamResult = {
    ok: true,
    value: projectSummary(),
  },
  deleteLeagueResult = deleteTeamResult,
  deleteLeaguesResult = deleteLeagueResult,
  deleteTeamsResult = deleteTeamResult,
  deletePlayerResult = deleteTeamResult,
  deletePlayersResult = deletePlayerResult,
  updateLeagueCountriesResult = deleteTeamResult,
  updateLeagueTiersResult = deleteTeamResult,
  updateTeamCountriesResult = deleteTeamResult,
}: PageSetup) => {
  const queryParams = new BehaviorSubject(convertToParamMap(initialQuery));
  const currentQuery: Record<string, unknown> = { ...initialQuery };
  let entityDeleted = false;
  let entityUpdated = false;
  const api = {
    getProjectSummary: vi.fn(() =>
      Promise.resolve({ ok: true as const, value: projectSummary(referenceDate) }),
    ),
    listEntities: vi.fn((request: PageRequest) =>
      Promise.resolve({
        ok: true as const,
        value: {
          rows: entityDeleted ? rowsAfterDelete : entityUpdated ? rowsAfterUpdate : rows,
          total: entityDeleted ? rowsAfterDelete.length : total,
          pageIndex: request.pageIndex,
          pageSize: request.pageSize,
        },
      }),
    ),
    listEntityFilterOptions: vi.fn(() => Promise.resolve({ ok: true as const, value: options })),
    deleteLeague: vi.fn(() => {
      if (deleteLeagueResult.ok) entityDeleted = true;
      return Promise.resolve(deleteLeagueResult);
    }),
    deleteLeagues: vi.fn(() => {
      if (deleteLeaguesResult.ok) entityDeleted = true;
      return Promise.resolve(deleteLeaguesResult);
    }),
    updateLeagueCountries: vi.fn(() => {
      if (updateLeagueCountriesResult.ok) entityUpdated = true;
      return Promise.resolve(updateLeagueCountriesResult);
    }),
    updateLeagueTiers: vi.fn(() => {
      if (updateLeagueTiersResult.ok) entityUpdated = true;
      return Promise.resolve(updateLeagueTiersResult);
    }),
    deleteTeam: vi.fn(() => {
      if (deleteTeamResult.ok) entityDeleted = true;
      return Promise.resolve(deleteTeamResult);
    }),
    deleteTeams: vi.fn(() => {
      if (deleteTeamsResult.ok) entityDeleted = true;
      return Promise.resolve(deleteTeamsResult);
    }),
    updateTeamCountries: vi.fn(() => {
      if (updateTeamCountriesResult.ok) entityUpdated = true;
      return Promise.resolve(updateTeamCountriesResult);
    }),
    updateEntityCustomBadges: vi.fn(() => {
      entityUpdated = true;
      return Promise.resolve({
        ok: true as const,
        value: { updatedEntityCount: 1 },
      });
    }),
    deletePlayer: vi.fn(() => {
      if (deletePlayerResult.ok) entityDeleted = true;
      return Promise.resolve(deletePlayerResult);
    }),
    deletePlayers: vi.fn(() => {
      if (deletePlayersResult.ok) entityDeleted = true;
      return Promise.resolve(deletePlayersResult);
    }),
  };
  const snackBar = { open: vi.fn() };
  const router = {
    navigate: vi.fn(
      (
        _commands: unknown[],
        extras: { queryParams?: Record<string, unknown> },
      ): Promise<boolean> => {
        for (const [key, value] of Object.entries(extras.queryParams ?? {})) {
          if (value === null) Reflect.deleteProperty(currentQuery, key);
          else currentQuery[key] = value;
        }
        queryParams.next(convertToParamMap(currentQuery));
        return Promise.resolve(true);
      },
    ),
  };
  await TestBed.configureTestingModule({
    imports: [EntityTablePage],
    providers: [
      provideNullable(),
      { provide: DesktopApi, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: {
          parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
          snapshot: { data: { entity } },
          queryParamMap: queryParams.asObservable(),
        },
      },
      { provide: Router, useValue: router },
      { provide: MatSnackBar, useValue: snackBar },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(EntityTablePage);
  await fixture.whenStable();
  return {
    api,
    fixture,
    documentLoader: TestbedHarnessEnvironment.documentRootLoader(fixture),
    loader: TestbedHarnessEnvironment.loader(fixture),
    queryParams,
    router,
    snackBar,
  };
};

const leagueRecord = (
  id: string,
  name: string,
  country?: { name: string; code2: string; code3: string },
): League => ({
  id,
  projectId: 'project-id',
  sourceName: 'transfermarkt',
  sourceId: id,
  name,
  countryName: country?.name,
  countryCode2: country?.code2,
  countryCode3: country?.code3,
  sourceUrl: `https://example.test/${id}`,
  teamCount: id === 'league-a' ? 20 : 16,
  playerCount: id === 'league-a' ? 500 : 300,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const teamRecord = (
  id: string,
  name: string,
  playerCount: number,
  country?: { name: string; code2: string; code3: string },
): Team => ({
  id,
  projectId: 'project-id',
  sourceName: 'transfermarkt',
  sourceId: id,
  name,
  countryName: country?.name,
  countryCode2: country?.code2,
  countryCode3: country?.code3,
  sourceUrl: `https://example.test/${id}`,
  playerCount,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const playerRecord = (id: string, name: string): Player => ({
  id,
  projectId: 'project-id',
  teamId: 'team-id',
  sourceName: 'transfermarkt',
  sourceId: id,
  name,
  sourceUrl: `https://example.test/${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('EntityTablePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each<{
    entity: EntityKind;
    icon: string;
    options: EntityFilterOptions;
    hiddenColumns: number;
  }>([
    {
      entity: 'leagues',
      icon: 'emoji_events',
      options: { entity: 'leagues', countries: [], seasons: [] },
      hiddenColumns: 5,
    },
    {
      entity: 'teams',
      icon: 'shield',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      hiddenColumns: 6,
    },
    {
      entity: 'players',
      icon: 'groups',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      hiddenColumns: 7,
    },
  ])(
    'hides optional columns by default in the $entity table',
    async ({ entity, icon, options, hiddenColumns }) => {
      const { fixture, loader } = await createPage({ entity, options });
      const table = await loader.getHarness(MatTableHarness);
      const headers = await table.getHeaderRows();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('app-page-header mat-icon')?.textContent?.trim()).toBe(icon);
      expect(element.querySelector('app-page-header h1')?.textContent).toContain(
        entity[0]?.toUpperCase() + entity.slice(1),
      );
      expect(element.querySelector('app-page-header p')?.textContent).toContain(
        `Search and browse imported provider ${entity}`,
      );
      expect(await headers[0]?.getCellTextByIndex()).not.toContain('Source ID');
      expect(await headers[0]?.getCellTextByIndex()).not.toContain('Created');
      const headerCells = await headers[0]?.getCellTextByIndex();
      expect(headerCells).not.toContain('Badge');
      expect(headerCells).not.toContain('Updated');
      expect(
        await (
          await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
        )
          .host()
          .then((host) => host.getAttribute('aria-label')),
      ).toBe(`Choose columns, ${hiddenColumns} hidden`);
      if (entity !== 'leagues') expect(headerCells).not.toContain('League');
      if (entity !== 'players') expect(headerCells).not.toContain('Season');
      if (entity === 'players') {
        expect(headerCells).toContain('Position detail');
        expect(headerCells).not.toContain('Team');
        expect(headerCells).not.toContain('Weight');
      }
    },
  );

  it('renders source player names with the same emphasis as combined player names', async () => {
    const { fixture } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: [playerRecord('player-a', 'Ada Striker')],
    });
    const name = (fixture.nativeElement as HTMLElement).querySelector(
      'tbody .mat-column-name strong',
    );

    expect(name?.textContent).toContain('Ada Striker');
  });

  it('assigns a global custom badge from a row action and filters by it', async () => {
    const badge = {
      id: 'badge-review',
      name: 'Review',
      description: 'Needs manual review',
      color: 'purple' as const,
    };
    const player = playerRecord('player-a', 'Ada Striker');
    const { api, documentLoader, fixture, loader, router } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
        customBadges: [badge],
      },
      rows: [player],
      rowsAfterUpdate: [{ ...player, customBadges: [badge] }],
    });

    const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));
    await menu.open();
    await menu.clickItem({ text: /Manage badges$/ });
    await documentLoader.getHarness(MatDialogHarness);
    const badgeCheckbox = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: /Review/ }),
    );
    await badgeCheckbox.check();
    await fixture.whenStable();
    const applyBadges = await documentLoader.getHarness(
      MatButtonHarness.with({ text: 'Apply badges' }),
    );
    expect(await applyBadges.isDisabled()).toBe(false);
    await applyBadges.click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.updateEntityCustomBadges).toHaveBeenCalledOnce());

    expect(api.updateEntityCustomBadges).toHaveBeenCalledWith({
      projectId: 'project-id',
      entity: 'players',
      ids: ['player-a'],
      addBadgeIds: ['badge-review'],
      removeBadgeIds: [],
    });
    expect(await documentLoader.getAllHarnesses(MatDialogHarness)).toHaveLength(0);

    await (await loader.getHarness(MatButtonHarness.with({ text: /Filters/ }))).click();
    const badges = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: '[aria-label="Filter players by badges"]' }),
    );
    await badges.open();
    await badges.clickOptions({ text: /Review/ });
    await fixture.whenStable();
    expect(await badges.getValueText()).toContain('Review');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalled());

    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: expect.objectContaining({ badge: ['badge-review'] }),
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      statuses: [],
      customBadgeIds: ['badge-review'],
    });
  });

  it.each([
    {
      entity: 'leagues' as const,
      options: { entity: 'leagues' as const, countries: [], seasons: [] },
      row: leagueRecord('league-status', 'Status League'),
    },
    {
      entity: 'teams' as const,
      options: {
        entity: 'teams' as const,
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      row: teamRecord('team-status', 'Status Team', 20),
    },
    {
      entity: 'players' as const,
      options: {
        entity: 'players' as const,
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      row: playerRecord('player-status', 'Status Player'),
    },
  ])(
    'renders derived statuses and an empty marker in the $entity badge column',
    async ({ entity, options, row }) => {
      window.localStorage.setItem(
        entityColumnPreferenceKey(entity),
        JSON.stringify({
          version: 2,
          order: ['name', 'badge', 'actions'],
          visible: ['name', 'badge', 'actions'],
        }),
      );
      const recentCreatedAt = new Date().toISOString();
      const { api, fixture, loader } = await createPage({
        entity,
        options,
        referenceDate: '2020-07-24',
        rows: [
          {
            ...row,
            createdAt: recentCreatedAt,
            updatedAt: '2020-01-24T23:59:59.999Z',
            customBadges: [
              {
                id: 'badge-review',
                name: 'Review',
                description: 'Needs manual review',
                color: 'purple',
              },
            ],
          },
          {
            ...row,
            id: `${row.id}-plain`,
            name: `${row.name} Plain`,
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2020-01-25T00:00:00.000Z',
          },
        ],
      });
      const table = await loader.getHarness(MatTableHarness);
      const rows = await table.getRows();

      expect((await rows[0].getCellTextByColumnName())['badge'].replace(/\s+/g, ' ').trim()).toBe(
        'New Old Review',
      );
      expect((await rows[1].getCellTextByColumnName())['badge']).toBe('—');
      expect(
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll(
            '.mat-column-badge app-entity-status-badge span',
          ),
          (badge) => badge.textContent.trim(),
        ),
      ).toEqual(['New', 'Old']);
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('.mat-column-badge app-custom-badge span')
          ?.getAttribute('title'),
      ).toBe('Needs manual review');
      expect(api.getProjectSummary).toHaveBeenCalledWith('project-id');
      if (entity === 'teams') {
        expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
      }
    },
  );

  it('uses the global badge ages for finder requests and displayed statuses', async () => {
    window.localStorage.setItem(
      ENTITY_STATUS_SETTINGS_STORAGE_KEY,
      JSON.stringify({ newDays: 10, oldMonths: 2 }),
    );
    window.localStorage.setItem(
      entityColumnPreferenceKey('teams'),
      JSON.stringify({
        version: 2,
        order: ['name', 'badge', 'actions'],
        visible: ['name', 'badge', 'actions'],
      }),
    );
    const createdAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const { api, loader } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      referenceDate: '2020-07-24',
      rows: [
        {
          ...teamRecord('configured-status', 'Configured status', 1),
          createdAt,
          updatedAt: '2020-05-24T23:59:59.999Z',
        },
      ],
    });

    const rows = await (await loader.getHarness(MatTableHarness)).getRows();
    expect((await rows[0].getCellTextByColumnName())['badge'].replace(/\s+/g, ' ').trim()).toBe(
      'New Old',
    );
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      statusSettings: { newDays: 10, oldMonths: 2 },
    });
  });

  it('keeps the Badge column configurable and non-sortable', async () => {
    const { api, documentLoader, fixture, loader } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: [teamRecord('team-id', 'Team', 20)],
    });
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
    ).click();
    const badgeColumn = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: 'Badge' }),
    );
    expect(await badgeColumn.isChecked()).toBe(false);
    expect(await badgeColumn.isDisabled()).toBe(false);
    await badgeColumn.check();
    await fixture.whenStable();
    expect(await badgeColumn.isChecked()).toBe(true);
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('teams')) ?? '{}',
      ) as { visible?: string[] };
      expect(stored.visible).toContain('badge');
    });

    const header = (await (await loader.getHarness(MatTableHarness)).getHeaderRows())[0];
    expect(await header.getCellTextByIndex()).toContain('Badge');
    const sort = await loader.getHarness(MatSortHarness);
    const badgeHeader = (await sort.getSortHeaders({ label: 'Badge' }))[0];
    const callsBeforeClick = api.listEntities.mock.calls.length;

    expect(await badgeHeader.isDisabled()).toBe(true);
    await badgeHeader.click();
    await fixture.whenStable();
    expect(api.listEntities).toHaveBeenCalledTimes(callsBeforeClick);
  });

  it.each([
    {
      entity: 'teams' as const,
      options: {
        entity: 'teams' as const,
        leagues: [{ id: 'league-id', name: 'Alpha League' }],
        hasTeamsWithoutLeague: true,
        countries: [],
        seasons: [],
      },
      rows: [
        {
          ...teamRecord('team-with-league', 'Alpha FC', 20),
          leagueId: 'league-id',
          leagueName: 'Alpha League',
        },
        teamRecord('team-without-league', 'Independent FC', 18),
      ],
    },
    {
      entity: 'players' as const,
      options: {
        entity: 'players' as const,
        teams: [{ id: 'team-id', name: 'Alpha FC' }],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: [
        {
          id: 'player-with-league',
          projectId: 'project-id',
          teamId: 'team-id',
          teamName: 'Alpha FC',
          leagueName: 'Alpha League',
          sourceName: 'transfermarkt' as const,
          sourceId: 'player-with-league',
          name: 'Player One',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'player-without-league',
          projectId: 'project-id',
          teamId: 'independent-team',
          teamName: 'Independent FC',
          sourceName: 'transfermarkt' as const,
          sourceId: 'player-without-league',
          name: 'Player Two',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  ])(
    'offers League as a hidden, persisted, sortable $entity column',
    async ({ entity, options, rows }) => {
      const { api, documentLoader, fixture, loader } = await createPage({
        entity,
        options,
        rows,
      });

      await (
        await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
      ).click();
      const leagueColumn = await documentLoader.getHarness(
        MatCheckboxHarness.with({ label: 'League' }),
      );
      expect(await leagueColumn.isChecked()).toBe(false);
      await leagueColumn.check();
      await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
      await fixture.whenStable();

      await vi.waitFor(() => {
        const stored = JSON.parse(
          window.localStorage.getItem(entityColumnPreferenceKey(entity)) ?? '{}',
        ) as { visible?: string[] };
        expect(stored.visible).toContain('leagueName');
      });
      const table = await loader.getHarness(MatTableHarness);
      const header = (await table.getHeaderRows())[0];
      expect(await header.getCellTextByIndex()).toContain('League');
      const tableRows = await table.getRows();
      const firstRow = tableRows[0];
      const secondRow = tableRows[1];
      expect((await firstRow.getCellTextByColumnName())['leagueName']).toBe('Alpha League');
      expect((await secondRow.getCellTextByColumnName())['leagueName']).toBe('—');

      const sort = await loader.getHarness(MatSortHarness);
      await (await sort.getSortHeaders({ label: 'League' }))[0]?.click();
      await fixture.whenStable();
      expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
        sort: 'leagueName',
        direction: 'asc',
      });
    },
  );

  it('offers the owning team as a hidden player column and sorts it when displayed', async () => {
    const player: Player = {
      id: 'player-id',
      projectId: 'project-id',
      teamId: 'team-id',
      teamName: 'Alpha FC',
      sourceName: 'transfermarkt',
      sourceId: 'player-id',
      name: 'Player One',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { api, documentLoader, fixture, loader } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [{ id: 'team-id', name: 'Alpha FC' }],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: [player],
    });

    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
    ).click();
    const teamColumn = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Team' }));
    expect(await teamColumn.isChecked()).toBe(false);
    await teamColumn.check();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('players')) ?? '{}',
      ) as { visible?: string[] };
      expect(stored.visible).toContain('teamName');
    });

    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    expect(await header.getCellTextByIndex()).toContain('Team');
    const firstRow = (await table.getRows())[0];
    expect((await firstRow.getCellTextByColumnName())['teamName']).toBe('Alpha FC');

    const sort = await loader.getHarness(MatSortHarness);
    const teamSortHeader = (await sort.getSortHeaders({ label: 'Team' }))[0];
    await teamSortHeader.click();
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      sort: 'teamName',
      direction: 'asc',
    });
  });

  it('offers Weight as a hidden player column, formats kilograms, and sorts it when displayed', async () => {
    const { api, documentLoader, fixture, loader } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: [
        { ...playerRecord('weighted-player', 'Weighted Player'), weight: 82 },
        playerRecord('unknown-weight', 'Unknown Weight'),
      ],
    });

    const table = await loader.getHarness(MatTableHarness);
    expect(await (await table.getHeaderRows())[0].getCellTextByIndex()).not.toContain('Weight');

    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
    ).click();
    const weightColumn = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: 'Weight' }),
    );
    expect(await weightColumn.isChecked()).toBe(false);
    await weightColumn.check();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();

    await vi.waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('players')) ?? '{}',
      ) as { visible?: string[] };
      expect(stored.visible).toContain('weight');
    });
    const rows = await table.getRows();
    expect((await rows[0].getCellTextByColumnName())['weight']).toBe('82 kg');
    expect((await rows[1].getCellTextByColumnName())['weight']).toBe('—');

    const sort = await loader.getHarness(MatSortHarness);
    await (await sort.getSortHeaders({ label: 'Weight' }))[0]?.click();
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      sort: 'weight',
      direction: 'asc',
    });
  });

  it('renders and sorts the detailed player position as a raw code', async () => {
    const player: Player = {
      id: 'player-id',
      projectId: 'project-id',
      teamId: 'team-id',
      sourceName: 'transfermarkt',
      sourceId: 'striker-id',
      name: 'Striker',
      positionDetail: 'ST',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { api, fixture, loader } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: ['ST'],
        feet: [],
      },
      rows: [player],
    });
    const row = (await (await loader.getHarness(MatTableHarness)).getRows())[0];
    expect((await row.getCellTextByColumnName())['positionDetail']).toBe('ST');
    const detailBadge = (fixture.nativeElement as HTMLElement).querySelector(
      'app-position-detail-badge abbr',
    );
    expect(detailBadge?.getAttribute('aria-label')).toBe('Detailed position ST');
    expect(detailBadge?.classList).toContain('bg-badge-attacker');

    const sort = await loader.getHarness(MatSortHarness);
    await (await sort.getSortHeaders({ label: 'Position detail' }))[0]?.click();
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      sort: 'positionDetail',
      direction: 'asc',
    });
  });

  it('restores saved filters for an unfiltered project table', async () => {
    window.localStorage.setItem(
      entityFilterPreferenceKey('project-id', 'players'),
      JSON.stringify({
        version: 1,
        filters: {
          parentIds: ['team-a', 'missing-team'],
          includeTeamsWithoutLeague: false,
          seasons: [],
          nationalities: ['Senegal', 'Missing'],
          positions: ['ATTACKER'],
          positionDetails: ['ST'],
          feet: ['RIGHT'],
        },
      }),
    );
    const { api, router } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [{ id: 'team-a', name: 'Alpha FC' }],
        nationalities: [{ name: 'Senegal', code: 'SN' }],
        positions: ['ATTACKER'],
        positionDetails: ['ST'],
        feet: ['RIGHT'],
      },
    });

    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: ['team-a'],
        season: null,
        country: null,
        nationality: ['Senegal'],
        position: ['ATTACKER'],
        positionDetail: ['ST'],
        foot: ['RIGHT'],
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      teamIds: ['team-a'],
      nationalities: ['Senegal'],
      positions: ['ATTACKER'],
      positionDetails: ['ST'],
      feet: ['RIGHT'],
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'players')) ?? '',
      ),
    ).toEqual({
      version: 6,
      filters: {
        parentIds: ['team-a'],
        includeTeamsWithoutLeague: false,
        tiers: [],
        includeLeaguesWithoutTier: false,
        seasons: [],
        countries: [],
        nationalities: ['Senegal'],
        positions: ['ATTACKER'],
        positionDetails: ['ST'],
        feet: ['RIGHT'],
        sourceNames: [],
        statuses: [],
        customBadgeIds: [],
      },
    });
  });

  it('lets an explicit filtered link replace the complete saved filter set', async () => {
    window.localStorage.setItem(
      entityFilterPreferenceKey('project-id', 'teams'),
      JSON.stringify({
        version: 2,
        filters: {
          parentIds: ['league-a'],
          includeTeamsWithoutLeague: false,
          seasons: ['2025'],
          nationalities: [],
          positions: [],
          positionDetails: [],
          feet: [],
          sourceNames: [],
        },
      }),
    );
    await createPage({
      entity: 'teams',
      initialQuery: { leagueId: ['league-b'] },
      options: {
        entity: 'teams',
        sourceNames: ['transfermarkt', 'soccerway'],
        leagues: [
          { id: 'league-a', name: 'League A' },
          { id: 'league-b', name: 'League B' },
        ],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: ['2025'],
      },
    });

    await vi.waitFor(() =>
      expect(
        JSON.parse(
          window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'teams')) ?? '',
        ),
      ).toEqual({
        version: 6,
        filters: {
          parentIds: ['league-b'],
          includeTeamsWithoutLeague: false,
          tiers: [],
          includeLeaguesWithoutTier: false,
          seasons: [],
          countries: [],
          nationalities: [],
          positions: [],
          positionDetails: [],
          feet: [],
          sourceNames: [],
          statuses: [],
          customBadgeIds: [],
        },
      }),
    );
  });

  it('stages, persists, cancels, and resets configurable columns with required actions', async () => {
    const { documentLoader, fixture, loader } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
    });
    const columnButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-column-button]' }),
    );
    expect(await (await columnButton.host()).getAttribute('aria-label')).toBe(
      'Choose columns, 5 hidden',
    );

    await columnButton.click();
    await fixture.whenStable();
    const drawer = await documentLoader.getHarness(MatDialogHarness);
    expect(await drawer.getAriaLabelledby()).toBe('entity-column-title');
    const name = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Name' }));
    const created = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Created' }));
    const season = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Season' }));
    const actions = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Actions' }));
    expect(await name.isChecked()).toBe(true);
    expect(await name.isDisabled()).toBe(true);
    expect(await created.isChecked()).toBe(false);
    expect(await season.isChecked()).toBe(false);
    expect(await actions.isChecked()).toBe(true);
    expect(await actions.isDisabled()).toBe(true);
    await created.check();
    const stagedNameHandle = await documentLoader.getHarness(
      MatButtonHarness.with({ selector: 'button[aria-label="Reorder Name column"]' }),
    );
    await (await stagedNameHandle.host()).sendKeys(TestKey.DOWN_ARROW, TestKey.DOWN_ARROW);
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    await fixture.whenStable();
    await vi.waitFor(async () =>
      expect(await documentLoader.getAllHarnesses(MatDialogHarness)).toHaveLength(0),
    );

    let header = (
      await loader.getHarness(MatTableHarness).then((table) => table.getHeaderRows())
    )[0];
    expect(await header.getCellTextByIndex()).toEqual([
      '',
      'Name',
      'Source',
      'Country',
      'Tier',
      'Teams',
      'Source page',
      'Actions',
    ]);

    await columnButton.click();
    await (await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Created' }))).check();
    await (await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Season' }))).check();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('leagues')) ?? '{}',
      ) as { visible?: string[] };
      expect(stored.visible).toContain('createdAt');
    });

    header = (await loader.getHarness(MatTableHarness).then((table) => table.getHeaderRows()))[0];
    expect(await header.getCellTextByIndex()).toContain('Created');
    expect(await header.getCellTextByIndex()).toContain('Actions');
    expect(
      JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('leagues')) ?? '',
      ) as unknown,
    ).toEqual({
      version: 2,
      order: [
        'name',
        'badge',
        'sourceName',
        'leagueCountry',
        'tier',
        'sourceId',
        'season',
        'teamCount',
        'sourceUrl',
        'createdAt',
        'updatedAt',
        'actions',
      ],
      visible: [
        'name',
        'sourceName',
        'leagueCountry',
        'tier',
        'season',
        'teamCount',
        'sourceUrl',
        'createdAt',
        'actions',
      ],
    });

    await columnButton.click();
    const resetNameHandle = await documentLoader.getHarness(
      MatButtonHarness.with({ selector: 'button[aria-label="Reorder Name column"]' }),
    );
    await (await resetNameHandle.host()).sendKeys(TestKey.DOWN_ARROW, TestKey.DOWN_ARROW);
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Reset to defaults' }))
    ).click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem(entityColumnPreferenceKey('leagues')) ?? ''),
      ).toEqual({
        version: 2,
        order: [
          'name',
          'badge',
          'sourceName',
          'leagueCountry',
          'tier',
          'sourceId',
          'season',
          'teamCount',
          'sourceUrl',
          'createdAt',
          'updatedAt',
          'actions',
        ],
        visible: [
          'name',
          'sourceName',
          'leagueCountry',
          'tier',
          'teamCount',
          'sourceUrl',
          'actions',
        ],
      }),
    );
    header = (await loader.getHarness(MatTableHarness).then((table) => table.getHeaderRows()))[0];
    expect(await header.getCellTextByIndex()).toContain('Actions');
    expect(await header.getCellTextByIndex()).not.toContain('Created');
    expect(await header.getCellTextByIndex()).not.toContain('Season');
  });

  it('reorders hidden columns by pointer drop and retains their position when enabled', async () => {
    const { documentLoader, fixture, loader } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
    });
    const columnButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-column-button]' }),
    );
    await columnButton.click();
    await fixture.whenStable();

    const dropList = document.querySelector<HTMLElement>('[role="list"]');
    if (!dropList) throw new Error('Column drop list was not created.');
    const debugElement = getDebugNode(dropList) as DebugElement | null;
    if (!debugElement) throw new Error('Column drop list debug element was not created.');
    debugElement.triggerEventHandler('cdkDropListDropped', {
      previousIndex: 5,
      currentIndex: 8,
    });
    await fixture.whenStable();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(window.localStorage.getItem(entityColumnPreferenceKey('leagues'))).not.toBeNull(),
    );

    expect(
      JSON.parse(window.localStorage.getItem(entityColumnPreferenceKey('leagues')) ?? ''),
    ).toMatchObject({
      order: [
        'name',
        'badge',
        'sourceName',
        'leagueCountry',
        'tier',
        'season',
        'teamCount',
        'sourceUrl',
        'sourceId',
        'createdAt',
        'updatedAt',
        'actions',
      ],
    });

    await columnButton.click();
    await (
      await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Source ID' }))
    ).check();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('leagues')) ?? '{}',
      ) as { visible?: string[] };
      expect(stored.visible).toContain('sourceId');
    });

    const header = (await (await loader.getHarness(MatTableHarness)).getHeaderRows())[0];
    expect(await header.getCellTextByIndex()).toEqual([
      '',
      'Name',
      'Source',
      'Country',
      'Tier',
      'Teams',
      'Source page',
      'Source ID',
      'Actions',
    ]);
  });

  it('moves required columns with the keyboard without reloading table data', async () => {
    const { api, documentLoader, fixture, loader } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
    });
    const callsBeforeReordering = api.listEntities.mock.calls.length;
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
    ).click();
    await fixture.whenStable();
    const nameHandle = await documentLoader.getHarness(
      MatButtonHarness.with({ selector: 'button[aria-label="Reorder Name column"]' }),
    );
    const handleElement = await nameHandle.host();
    await handleElement.sendKeys(TestKey.DOWN_ARROW, TestKey.DOWN_ARROW);
    await fixture.whenStable();
    expect(document.querySelector('[data-column-announcement]')?.textContent).toContain(
      'Name moved to position 3 of 12.',
    );
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(entityColumnPreferenceKey('leagues')) ?? '{}',
      ) as { order?: string[] };
      expect(stored.order?.indexOf('name')).toBe(2);
    });

    const header = (await (await loader.getHarness(MatTableHarness)).getHeaderRows())[0];
    expect(await header.getCellTextByIndex()).toEqual([
      '',
      'Source',
      'Name',
      'Country',
      'Tier',
      'Teams',
      'Source page',
      'Actions',
    ]);
    expect(api.listEntities).toHaveBeenCalledTimes(callsBeforeReordering);
  });

  it('shows player timestamps and resets hidden active sorting and pagination', async () => {
    const player: Player = {
      id: 'player-id',
      projectId: 'project-id',
      teamId: 'team-id',
      sourceName: 'transfermarkt',
      sourceId: 'player-1',
      name: 'Player One',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
    };
    window.localStorage.setItem(
      entityColumnPreferenceKey('players'),
      JSON.stringify([
        'name',
        'sourceId',
        'countryName',
        'jerseyNumber',
        'position',
        'birthdate',
        'height',
        'foot',
        'joined',
        'contractExpires',
        'marketValue',
        'createdAt',
        'updatedAt',
      ]),
    );
    const { api, documentLoader, fixture, loader } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: [player],
      total: 100,
    });
    const table = await loader.getHarness(MatTableHarness);
    const row = (await table.getRows())[0];
    const rowText = await row.getCellTextByColumnName();
    expect(rowText['sourceId']).toBe(player.sourceId);
    expect(rowText['positionDetail']).toBeUndefined();
    expect(rowText['createdAt']).toBe(formatUiTimestamp(player.createdAt));
    expect(rowText['updatedAt']).toBe(formatUiTimestamp(player.updatedAt));

    const sort = await loader.getHarness(MatSortHarness);
    const createdHeader = (await sort.getSortHeaders({ label: 'Created' }))[0];
    await createdHeader.click();
    await fixture.whenStable();
    await (await loader.getHarness(MatPaginatorHarness)).goToNextPage();
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      sort: 'createdAt',
      direction: 'asc',
      pageIndex: 1,
    });

    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
    ).click();
    await (
      await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Created' }))
    ).uncheck();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
        sort: 'name',
        direction: 'asc',
        pageIndex: 0,
      }),
    );
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      sort: 'name',
      direction: 'asc',
      pageIndex: 0,
    });
  });

  it('shows accessible edit and refresh actions for league rows', async () => {
    const league: League = {
      id: 'league-id',
      projectId: 'project-id',
      sourceName: 'transfermarkt',
      sourceId: 'GB1',
      name: 'Premier League',
      countryName: 'England',
      countryCode2: 'GB',
      countryCode3: 'ENG',
      season: '2026',
      sourceUrl: 'https://example.test/GB1',
      teamCount: 20,
      playerCount: 501,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const api = {
      getProjectSummary: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: projectSummary() }),
      ),
      listEntities: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { rows: [league], total: 1, pageIndex: 0, pageSize: 25 },
        }),
      ),
      listEntityFilterOptions: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: { entity: 'leagues' as const, countries: [], seasons: ['2026'] },
        }),
      ),
    };
    const router = { navigate: vi.fn() };
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(undefined) })) };
    await TestBed.configureTestingModule({
      imports: [EntityTablePage],
      providers: [
        provideNullable(),
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
            snapshot: { data: { entity: 'leagues' } },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: Router, useValue: router },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EntityTablePage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('button[aria-label="Actions for Premier League"]')).toBeTruthy();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    expect((await header.getCellTextByIndex()).slice(0, 4)).toEqual([
      '',
      'Name',
      'Source',
      'Country',
    ]);
    expect(await (await table.getRows())[0].getCellTextByColumnName()).toMatchObject({
      leagueCountry: 'England',
    });
    const countryFlag = element.querySelector('.mat-column-leagueCountry img');
    expect(countryFlag?.getAttribute('alt')).toBe('');
    expect(countryFlag?.getAttribute('src')).toContain('flags/20x15/gb-eng.png');
    const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));
    await menu.open();
    const items = await menu.getItems();
    const itemTexts = await Promise.all(items.map((item) => item.getText()));
    expect(itemTexts.map((text) => text.endsWith('Edit'))).toContain(true);
    expect(itemTexts.map((text) => text.endsWith('Refresh'))).toContain(true);
    expect(itemTexts.map((text) => text.endsWith('Delete'))).toContain(true);

    await menu.clickItem({ text: /Edit$/ });
    expect(dialog.open).toHaveBeenCalledOnce();
    await menu.open();
    await menu.clickItem({ text: /Refresh$/ });
    expect(router.navigate).toHaveBeenCalledWith(['/projects', 'project-id', 'source', 'import'], {
      queryParams: {
        operation: 'synchronize',
        entity: 'leagues',
        targetId: 'league-id',
        returnTo: 'leagues',
      },
    });
  });

  it('selects visible leagues with accessible row and indeterminate header checkboxes', async () => {
    const { fixture, loader } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
      rows: [leagueRecord('league-a', 'Alpha League'), leagueRecord('league-b', 'Beta League')],
      total: 51,
    });
    const alpha = await loader.getHarness(
      MatCheckboxHarness.with({ selector: '[data-ui-row-select-checkbox]' }),
    );
    const selectAll = await loader.getHarness(
      MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
    );

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLInputElement>('[data-ui-row-select-checkbox] input')
        ?.getAttribute('aria-label'),
    ).toBe('Select Alpha League');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    await alpha.check();
    await fixture.whenStable();
    expect(await selectAll.isIndeterminate()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 league selected');
    expect(
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' })),
    ).toBeTruthy();
    expect(
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' })),
    ).toBeTruthy();
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);

    await selectAll.check();
    await fixture.whenStable();
    expect(await selectAll.isChecked()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 leagues selected');

    const paginator = await loader.getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();

    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    const sort = await loader.getHarness(MatSortHarness);
    await (await sort.getSortHeaders({ label: 'Name' }))[0]?.click();
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
  });

  it('selects visible teams with entity-aware accessible labels', async () => {
    const { fixture, loader } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: [teamRecord('team-a', 'Alpha FC', 28), teamRecord('team-b', 'Beta FC', 29)],
    });
    const rowCheckboxes = await loader.getAllHarnesses(
      MatCheckboxHarness.with({ selector: '[data-ui-row-select-checkbox]' }),
    );
    const selectAll = await loader.getHarness(
      MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
    );

    expect(rowCheckboxes).toHaveLength(2);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLInputElement>('[data-ui-row-select-checkbox] input')
        ?.getAttribute('aria-label'),
    ).toBe('Select Alpha FC');
    await rowCheckboxes[0]?.check();
    await fixture.whenStable();

    const footer = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-ui-selection-footer]',
    );
    expect(footer?.getAttribute('aria-label')).toBe('Selected team actions');
    expect(footer?.textContent).toContain('1 team selected');
    expect(await selectAll.isIndeterminate()).toBe(true);
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);

    await selectAll.check();
    await fixture.whenStable();
    expect(await selectAll.isChecked()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 teams selected');
  });

  it('preserves mixed custom badge assignments until a bulk tri-state choice changes them', async () => {
    const badge = {
      id: 'badge-review',
      name: 'Review',
      description: 'Needs manual review',
      color: 'purple' as const,
    };
    const { api, documentLoader, fixture, loader } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
        customBadges: [badge],
      },
      rows: [
        { ...playerRecord('player-a', 'Ada Striker'), customBadges: [badge] },
        playerRecord('player-b', 'Bea Keeper'),
      ],
    });
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await fixture.whenStable();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-badges-button]' }))
    ).click();
    const badgeCheckbox = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: /Review/ }),
    );
    expect(await badgeCheckbox.isIndeterminate()).toBe(true);

    await badgeCheckbox.check();
    await fixture.whenStable();
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply badges' }))
    ).click();
    await vi.waitFor(() => expect(api.updateEntityCustomBadges).toHaveBeenCalledOnce());
    expect(api.updateEntityCustomBadges).toHaveBeenCalledWith({
      projectId: 'project-id',
      entity: 'players',
      ids: ['player-a', 'player-b'],
      addBadgeIds: ['badge-review'],
      removeBadgeIds: [],
    });
  });

  it('keeps player rows read-only and deletes one player from its actions dropdown', async () => {
    const player = playerRecord('player-a', 'Ada Striker');
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: [player],
      rowsAfterDelete: [],
    });
    const table = await loader.getHarness(MatTableHarness);
    const headerCells = await (await table.getHeaderRows())[0].getCellTextByIndex();
    expect(headerCells[0]).toBe('');
    expect(headerCells).toContain('Actions');

    const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));
    await menu.open();
    expect(await Promise.all((await menu.getItems()).map((item) => item.getText()))).toEqual([
      'labelManage badges',
      'deleteDelete',
    ]);
    await menu.clickItem({ text: /Delete$/ });
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getRole()).toBe('alertdialog');
    expect(await dialog.getTitleText()).toBe('Delete player?');
    expect(await dialog.getText()).toContain('Ada Striker');
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete player' }))).click();

    await vi.waitFor(() => expect(api.deletePlayer).toHaveBeenCalledWith('project-id', 'player-a'));
    await fixture.whenStable();
    expect(snackBar.open).toHaveBeenCalledWith('Player deleted.', 'Dismiss', { duration: 3000 });
  });

  it('multiselects and bulk deletes players without exposing editable bulk fields', async () => {
    const players = [
      playerRecord('player-a', 'Ada Striker'),
      playerRecord('player-b', 'Ben Keeper'),
    ];
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
      rows: players,
      rowsAfterDelete: [],
    });

    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await fixture.whenStable();
    const footer = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-ui-selection-footer]',
    );
    expect(footer?.getAttribute('aria-label')).toBe('Selected player actions');
    expect(footer?.textContent).toContain('2 players selected');
    expect(
      await loader.getAllHarnesses(
        MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }),
      ),
    ).toHaveLength(0);
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);

    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Delete selected players?');
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete 2 players' }))).click();

    await vi.waitFor(() =>
      expect(api.deletePlayers).toHaveBeenCalledWith('project-id', ['player-a', 'player-b']),
    );
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith('2 players deleted.', 'Dismiss', {
      duration: 3000,
    });
  });

  it('bulk deletes selected teams with aggregate player counts and clamps pagination', async () => {
    const teams = [teamRecord('team-a', 'Alpha FC', 28), teamRecord('team-b', 'Beta FC', 29)];
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: teams,
      rowsAfterDelete: [],
      total: 27,
    });
    const paginator = await loader.getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);

    expect(await dialog.getTitleText()).toBe('Delete selected teams?');
    expect(await dialog.getText()).toContain('2 teams selected');
    expect(await dialog.getText()).toContain('57 players');
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete 2 teams' }))).click();

    await vi.waitFor(() =>
      expect(api.deleteTeams).toHaveBeenCalledWith('project-id', ['team-a', 'team-b']),
    );
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.at(-1)?.[0]).toMatchObject({ pageIndex: 0 });
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith('2 teams deleted.', 'Dismiss', {
      duration: 3000,
    });
  });

  it('changes the country for selected teams', async () => {
    const teams = [
      teamRecord('team-a', 'Alpha FC', 28, {
        name: 'Czech Republic',
        code2: 'CZ',
        code3: 'CZE',
      }),
      teamRecord('team-b', 'Beta FC', 29, {
        name: 'England',
        code2: 'GB',
        code3: 'ENG',
      }),
    ];
    const updated = teams.map((team) => ({
      ...team,
      countryName: 'Slovakia',
      countryCode2: 'SK',
      countryCode3: 'SVK',
    }));
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: teams,
      rowsAfterUpdate: updated,
    });
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Change country for selected teams');
    expect(await dialog.getText()).toContain('selected teams currently have different countries');
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    await autocomplete.enterText('svk');
    await autocomplete.selectOption({ text: 'Slovakia' });
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply country' }))).click();

    await vi.waitFor(() =>
      expect(api.updateTeamCountries).toHaveBeenCalledWith(
        'project-id',
        ['team-a', 'team-b'],
        'SVK',
      ),
    );
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith('Country updated for 2 teams.', 'Dismiss', {
      duration: 3000,
    });
  });

  it('clears a common team country and retains selection when the update fails', async () => {
    const teams = [
      teamRecord('team-a', 'Alpha FC', 28, {
        name: 'Czech Republic',
        code2: 'CZ',
        code3: 'CZE',
      }),
      teamRecord('team-b', 'Beta FC', 29, {
        name: 'Czech Republic',
        code2: 'CZ',
        code3: 'CZE',
      }),
    ];
    const failure: Result<ProjectSummary> = {
      ok: false,
      error: { code: 'DATABASE', message: 'Team countries could not be updated.' },
    };
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: teams,
      updateTeamCountriesResult: failure,
    });
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    expect(await autocomplete.getValue()).toBe('Czech Republic');
    await autocomplete.clear();
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Clear country' }))).click();

    await vi.waitFor(() =>
      expect(api.updateTeamCountries).toHaveBeenCalledWith(
        'project-id',
        ['team-a', 'team-b'],
        undefined,
      ),
    );
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 teams selected');
    expect(api.listEntities).toHaveBeenCalledOnce();
    expect(snackBar.open).toHaveBeenCalledWith('Team countries could not be updated.', 'Dismiss', {
      duration: 6000,
    });
  });

  it('disables team bulk actions while deleting and retains selection when deletion fails', async () => {
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: [teamRecord('team-a', 'Alpha FC', 28)],
    });
    let resolveDelete!: (result: Result<ProjectSummary>) => void;
    api.deleteTeams.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    const countryButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }),
    );
    const deleteButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }),
    );
    await deleteButton.click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete 1 team' }))).click();

    await vi.waitFor(() => expect(api.deleteTeams).toHaveBeenCalledWith('project-id', ['team-a']));
    await fixture.whenStable();
    expect(await countryButton.isDisabled()).toBe(true);
    expect(await deleteButton.isDisabled()).toBe(true);

    resolveDelete({
      ok: false,
      error: { code: 'DATABASE', message: 'Selected teams could not be deleted.' },
    });
    await vi.waitFor(() =>
      expect(snackBar.open).toHaveBeenCalledWith(
        'Selected teams could not be deleted.',
        'Dismiss',
        { duration: 6000 },
      ),
    );
    await fixture.whenStable();
    expect(await countryButton.isDisabled()).toBe(false);
    expect(await deleteButton.isDisabled()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 team selected');
    expect(api.listEntities).toHaveBeenCalledOnce();
  });

  it('bulk deletes selected leagues with aggregate descendant counts and clamps pagination', async () => {
    const leagues = [
      leagueRecord('league-a', 'Alpha League'),
      leagueRecord('league-b', 'Beta League'),
    ];
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
      rows: leagues,
      rowsAfterDelete: [],
      total: 27,
    });
    const paginator = await loader.getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);

    expect(await dialog.getTitleText()).toBe('Delete selected leagues?');
    expect(await dialog.getText()).toContain('2 selected leagues');
    expect(await dialog.getText()).toContain('36 teams');
    expect(await dialog.getText()).toContain('800 players');
    await (
      await dialog.getHarness(
        MatRadioButtonHarness.with({
          label: /Delete selected leagues, teams and players/,
        }),
      )
    ).check();
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete 2 leagues' }))).click();

    await vi.waitFor(() =>
      expect(api.deleteLeagues).toHaveBeenCalledWith(
        'project-id',
        ['league-a', 'league-b'],
        'league-and-teams',
      ),
    );
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.at(-1)?.[0]).toMatchObject({ pageIndex: 0 });
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith('2 leagues deleted.', 'Dismiss', {
      duration: 3000,
    });
  });

  it('changes the tier for selected leagues with mixed values', async () => {
    const leagues = [
      { ...leagueRecord('league-a', 'Alpha League'), tier: 1 },
      leagueRecord('league-b', 'Beta League'),
    ];
    const updated = leagues.map((league) => ({ ...league, tier: 4 }));
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'leagues',
      options: {
        entity: 'leagues',
        countries: [],
        seasons: [],
        tiers: [1, 4],
        hasLeaguesWithoutTier: true,
      },
      rows: leagues,
      rowsAfterUpdate: updated,
    });

    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-tier-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Change tier for selected leagues');
    expect(await dialog.getText()).toContain('currently have different tiers');
    const tierSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="Tier for selected leagues"]' }),
    );
    await tierSelect.open();
    await tierSelect.clickOptions({ text: 'Tier 4' });
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply tier' }))).click();

    await vi.waitFor(() =>
      expect(api.updateLeagueTiers).toHaveBeenCalledWith('project-id', ['league-a', 'league-b'], 4),
    );
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith('Tier updated for 2 leagues.', 'Dismiss', {
      duration: 3000,
    });
  });

  it('changes the country for selected leagues', async () => {
    const leagues = [
      leagueRecord('league-a', 'Alpha League', {
        name: 'Czech Republic',
        code2: 'CZ',
        code3: 'CZE',
      }),
      leagueRecord('league-b', 'Beta League', {
        name: 'England',
        code2: 'GB',
        code3: 'ENG',
      }),
    ];
    const updated = leagues.map((league) => ({
      ...league,
      countryName: 'Slovakia',
      countryCode2: 'SK',
      countryCode3: 'SVK',
    }));
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
      rows: leagues,
      rowsAfterUpdate: updated,
    });
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getText()).toContain('currently have different countries');
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    await autocomplete.enterText('svk');
    await autocomplete.selectOption({ text: 'Slovakia' });
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Apply country' }))).click();

    await vi.waitFor(() =>
      expect(api.updateLeagueCountries).toHaveBeenCalledWith(
        'project-id',
        ['league-a', 'league-b'],
        'SVK',
      ),
    );
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-ui-selection-footer]'),
    ).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith('Country updated for 2 leagues.', 'Dismiss', {
      duration: 3000,
    });
  });

  it('clears a common country and retains selection when a bulk action fails', async () => {
    const leagues = [
      leagueRecord('league-a', 'Alpha League', {
        name: 'Czech Republic',
        code2: 'CZ',
        code3: 'CZE',
      }),
      leagueRecord('league-b', 'Beta League', {
        name: 'Czech Republic',
        code2: 'CZ',
        code3: 'CZE',
      }),
    ];
    const failure: Result<ProjectSummary> = {
      ok: false,
      error: { code: 'DATABASE', message: 'Countries could not be updated.' },
    };
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
      rows: leagues,
      updateLeagueCountriesResult: failure,
    });
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    expect(await autocomplete.getValue()).toBe('Czech Republic');
    await autocomplete.clear();
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Clear country' }))).click();

    await vi.waitFor(() =>
      expect(api.updateLeagueCountries).toHaveBeenCalledWith(
        'project-id',
        ['league-a', 'league-b'],
        undefined,
      ),
    );
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 leagues selected');
    expect(api.listEntities).toHaveBeenCalledOnce();
    expect(snackBar.open).toHaveBeenCalledWith('Countries could not be updated.', 'Dismiss', {
      duration: 6000,
    });
  });

  it('disables bulk actions while deleting and retains selection when deletion fails', async () => {
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
      rows: [leagueRecord('league-a', 'Alpha League')],
    });
    let resolveDelete!: (result: Result<ProjectSummary>) => void;
    api.deleteLeagues.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    await (
      await loader.getHarness(
        MatCheckboxHarness.with({ selector: '[data-ui-select-all-checkbox]' }),
      )
    ).check();
    const countryButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-bulk-country-button]' }),
    );
    const deleteButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }),
    );
    await deleteButton.click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Delete selected league?');
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete 1 league' }))).click();

    await vi.waitFor(() =>
      expect(api.deleteLeagues).toHaveBeenCalledWith('project-id', ['league-a'], 'league-only'),
    );
    await fixture.whenStable();
    expect(await countryButton.isDisabled()).toBe(true);
    expect(await deleteButton.isDisabled()).toBe(true);

    resolveDelete({
      ok: false,
      error: { code: 'DATABASE', message: 'Selected leagues could not be deleted.' },
    });
    await vi.waitFor(() =>
      expect(snackBar.open).toHaveBeenCalledWith(
        'Selected leagues could not be deleted.',
        'Dismiss',
        { duration: 6000 },
      ),
    );
    await fixture.whenStable();
    expect(await countryButton.isDisabled()).toBe(false);
    expect(await deleteButton.isDisabled()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 league selected');
    expect(api.listEntities).toHaveBeenCalledOnce();
  });

  it.each([
    { mode: 'league-only' as const, selectCascade: false },
    { mode: 'league-and-teams' as const, selectCascade: true },
  ])(
    'confirms league deletion with $mode and returns from an empty last page',
    async ({ mode, selectCascade }) => {
      const league: League = {
        id: 'league-id',
        projectId: 'project-id',
        sourceName: 'transfermarkt',
        sourceId: 'GB1',
        name: 'Premier League',
        sourceUrl: 'https://example.test/GB1',
        teamCount: 20,
        playerCount: 501,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      const { api, documentLoader, fixture, loader, snackBar } = await createPage({
        entity: 'leagues',
        options: { entity: 'leagues', countries: [], seasons: [] },
        rows: [league],
        rowsAfterDelete: [],
        total: 26,
      });
      const paginator = await loader.getHarness(MatPaginatorHarness);
      await paginator.goToNextPage();
      const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));

      await menu.open();
      await menu.clickItem({ text: /Delete$/ });
      let dialog = await documentLoader.getHarness(MatDialogHarness);
      expect(await dialog.getRole()).toBe('alertdialog');
      expect(await dialog.getTitleText()).toBe('Delete league?');
      expect(await dialog.getText()).toContain('Premier League');
      expect(await dialog.getText()).toContain('20 teams');
      expect(await dialog.getText()).toContain('501 players');
      const safeOption = await dialog.getHarness(
        MatRadioButtonHarness.with({ label: /Delete league only/ }),
      );
      expect(await safeOption.isChecked()).toBe(true);

      if (!selectCascade) {
        await (await dialog.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
        expect(api.deleteLeague).not.toHaveBeenCalled();
        await menu.open();
        await menu.clickItem({ text: /Delete$/ });
        dialog = await documentLoader.getHarness(MatDialogHarness);
      } else {
        await (
          await dialog.getHarness(
            MatRadioButtonHarness.with({ label: /Delete league, teams and players/ }),
          )
        ).check();
      }
      await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete league' }))).click();

      await vi.waitFor(() =>
        expect(api.deleteLeague).toHaveBeenCalledWith('project-id', 'league-id', mode),
      );
      await fixture.whenStable();
      expect(api.listEntities.mock.calls.at(-1)?.[0]).toMatchObject({ pageIndex: 0 });
      expect(api.listEntityFilterOptions).toHaveBeenCalledTimes(2);
      expect(snackBar.open).toHaveBeenCalledWith('League deleted.', 'Dismiss', {
        duration: 3000,
      });
    },
  );

  it('keeps the league visible and reports an error when deletion fails', async () => {
    const league: League = {
      id: 'league-id',
      projectId: 'project-id',
      sourceName: 'soccerway',
      sourceId: 'premier-league',
      name: 'Premier League',
      sourceUrl: 'https://example.test/premier-league',
      teamCount: 20,
      playerCount: 501,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
      rows: [league],
      deleteLeagueResult: {
        ok: false,
        error: { code: 'DATABASE', message: 'The league could not be deleted.' },
      },
    });
    const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));

    await menu.open();
    await menu.clickItem({ text: /Delete$/ });
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete league' }))).click();

    await vi.waitFor(() =>
      expect(api.deleteLeague).toHaveBeenCalledWith('project-id', 'league-id', 'league-only'),
    );
    await fixture.whenStable();
    expect(api.listEntities).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Premier League');
    expect(snackBar.open).toHaveBeenCalledWith('The league could not be deleted.', 'Dismiss', {
      duration: 6000,
    });
  });

  it('confirms team deletion, cascades the player warning, and returns from an empty last page', async () => {
    const team: Team = {
      id: 'team-id',
      projectId: 'project-id',
      leagueId: 'league-id',
      sourceName: 'eurofotbal',
      sourceId: 'bohemians-1905',
      name: 'Bohemians Praha 1905',
      countryName: 'Czech Republic',
      countryCode2: 'CZ',
      countryCode3: 'CZE',
      sourceUrl: 'https://example.test/bohemians-1905',
      playerCount: 28,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [{ id: 'league-id', name: 'League' }],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
      rows: [team],
      rowsAfterDelete: [],
      total: 26,
    });
    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    expect((await header.getCellTextByIndex()).slice(0, 4)).toEqual([
      '',
      'Name',
      'Source',
      'Country',
    ]);
    expect(await (await table.getRows())[0].getCellTextByColumnName()).toMatchObject({
      teamCountry: 'Czech Republic',
    });
    const countryFlag = (fixture.nativeElement as HTMLElement).querySelector(
      '.mat-column-teamCountry img',
    );
    expect(countryFlag?.getAttribute('alt')).toBe('');
    expect(countryFlag?.getAttribute('src')).toContain('flags/20x15/cz.png');
    const paginator = await loader.getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));

    await menu.open();
    expect(await Promise.all((await menu.getItems()).map((item) => item.getText()))).toEqual([
      'labelManage badges',
      'editEdit',
      'syncRefresh',
      'deleteDelete',
    ]);
    await menu.clickItem({ text: /Delete$/ });
    let dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getRole()).toBe('alertdialog');
    expect(await dialog.getTitleText()).toBe('Delete team?');
    expect(await dialog.getText()).toContain('Bohemians Praha 1905');
    expect(await dialog.getText()).toContain('28 players');
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    expect(api.deleteTeam).not.toHaveBeenCalled();

    await menu.open();
    await menu.clickItem({ text: /Delete$/ });
    dialog = await documentLoader.getHarness(MatDialogHarness);
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete team' }))).click();

    await vi.waitFor(() => expect(api.deleteTeam).toHaveBeenCalledWith('project-id', 'team-id'));
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.at(-1)?.[0]).toMatchObject({ pageIndex: 0 });
    expect(snackBar.open).toHaveBeenCalledWith('Team deleted.', 'Dismiss', { duration: 3000 });
  });

  it('keeps the team visible and reports the error when deletion fails', async () => {
    const team: Team = {
      id: 'team-id',
      projectId: 'project-id',
      sourceName: 'soccerway',
      sourceId: 'slavia-prague',
      name: 'Slavia Prague',
      sourceUrl: 'https://example.test/slavia-prague',
      playerCount: 30,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { api, documentLoader, fixture, loader, snackBar } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: true,
        countries: [],
        seasons: [],
      },
      rows: [team],
      deleteTeamResult: {
        ok: false,
        error: { code: 'DATABASE', message: 'The team could not be deleted.' },
      },
    });
    const menu = await loader.getHarness(MatMenuHarness.with({ triggerIconName: 'more_vert' }));

    await menu.open();
    await menu.clickItem({ text: /Delete$/ });
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    await (await dialog.getHarness(MatButtonHarness.with({ text: 'Delete team' }))).click();

    await vi.waitFor(() => expect(api.deleteTeam).toHaveBeenCalledWith('project-id', 'team-id'));
    await fixture.whenStable();
    expect(api.listEntities).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Slavia Prague');
    expect(snackBar.open).toHaveBeenCalledWith('The team could not be deleted.', 'Dismiss', {
      duration: 6000,
    });
  });

  it('stages team filters in a right drawer, applies them together, and clears them', async () => {
    const { api, documentLoader, fixture, loader, router } = await createPage({
      entity: 'teams',
      options: {
        entity: 'teams',
        sourceNames: ['transfermarkt', 'soccerway', 'worldfootball'],
        leagues: [
          { id: 'league-a', name: 'League A' },
          { id: 'league-b', name: 'League B' },
        ],
        hasTeamsWithoutLeague: true,
        countries: [
          { name: 'England', code: 'GB-ENG' },
          { name: 'Portugal', code: 'PT' },
          { name: 'Scotland', code: 'GB-SCT' },
        ],
        seasons: ['2025', '2026'],
      },
    });
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    expect(await filterButton.getAppearance()).toBe('tonal');

    await filterButton.click();
    await fixture.whenStable();
    const drawer = await documentLoader.getHarness(MatDialogHarness);
    expect(await drawer.getRole()).toBe('dialog');
    expect(await drawer.getAriaLabelledby()).toBe('entity-filter-title');
    const panel = document.querySelector<HTMLElement>('.entity-filter-drawer-panel');
    expect(panel?.style.height).toBe('100vh');
    expect(panel?.parentElement?.style.justifyContent).toBe('flex-end');
    expect(panel?.querySelector('[data-ui-filter-form] > footer')).toBeTruthy();
    const countryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter teams by countries"]',
      }),
    );
    await countryAutocomplete.enterText('ENG');
    expect(await countryAutocomplete.getOptions({ text: 'England' })).toHaveLength(1);
    expect(await countryAutocomplete.getOptions({ text: 'Scotland' })).toHaveLength(0);
    await countryAutocomplete.selectOption({ text: 'England' });
    await countryAutocomplete.enterText('sco');
    await countryAutocomplete.selectOption({ text: 'Scotland' });
    const countryGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-country-chip-grid]' }),
    );
    const selectedCountries = await countryGrid.getRows();
    expect(await Promise.all(selectedCountries.map((row) => row.getText()))).toEqual([
      'England',
      'Scotland',
    ]);
    expect(
      Array.from(
        document.querySelectorAll<HTMLImageElement>('[data-ui-country-chip-grid] img'),
        (image) => image.getAttribute('src'),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('flags/20x15/gb-eng.png'),
        expect.stringContaining('flags/20x15/gb-sct.png'),
      ]),
    );
    await selectedCountries[0]?.remove();
    const leagueAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter teams by leagues"]',
      }),
    );
    await leagueAutocomplete.enterText('LEAGUE A');
    expect(await leagueAutocomplete.getOptions({ text: 'League A' })).toHaveLength(1);
    expect(await leagueAutocomplete.getOptions({ text: 'League B' })).toHaveLength(0);
    await leagueAutocomplete.selectOption({ text: 'League A' });
    await leagueAutocomplete.enterText('league a');
    expect(await leagueAutocomplete.getOptions({ text: 'League A' })).toHaveLength(0);
    expect(await leagueAutocomplete.getOptions({ text: 'No matching leagues' })).toHaveLength(1);
    await leagueAutocomplete.clear();
    await leagueAutocomplete.enterText('league b');
    await leagueAutocomplete.selectOption({ text: 'League B' });
    const leagueGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-parent-chip-grid]' }),
    );
    const selectedLeagues = await leagueGrid.getRows();
    expect(await Promise.all(selectedLeagues.map((row) => row.getText()))).toEqual([
      'League A',
      'League B',
    ]);
    await selectedLeagues[1]?.remove();
    const seasonSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="Filter teams by seasons"]' }),
    );
    await seasonSelect.open();
    const seasons = await seasonSelect.getOptions({ text: '2026' });
    await seasons[0]?.click();
    await seasonSelect.close();
    const sourceSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="Filter teams by sources"]' }),
    );
    await sourceSelect.open();
    await sourceSelect.clickOptions({ text: /Transfermarkt|Soccerway|WorldFootball/ });
    await sourceSelect.close();
    const badgeSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="Filter teams by badges"]' }),
    );
    await badgeSelect.open();
    await badgeSelect.clickOptions({ text: /New|Old/ });
    expect(document.querySelectorAll('.mat-mdc-option app-entity-status-badge')).toHaveLength(2);
    await badgeSelect.close();
    const noLeague = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: 'Include teams without a league' }),
    );
    await noLeague.check();
    await fixture.whenStable();
    expect(router.navigate).not.toHaveBeenCalled();

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledOnce());
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: ['league-a'],
        noLeague: 'true',
        noTier: null,
        tier: null,
        teamId: null,
        season: ['2026'],
        country: ['Scotland'],
        nationality: null,
        position: null,
        positionDetail: null,
        foot: null,
        badge: ['new', 'old'],
        sourceName: ['transfermarkt', 'soccerway', 'worldfootball'],
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      leagueId: 'league-a',
      leagueIds: ['league-a'],
      includeTeamsWithoutLeague: true,
      seasons: ['2026'],
      countries: ['Scotland'],
      sourceNames: ['transfermarkt', 'soccerway', 'worldfootball'],
      statuses: ['new', 'old'],
      statusSettings: { newDays: 3, oldMonths: 6 },
      pageIndex: 0,
    });
    expect(
      Number.isNaN(
        Date.parse(api.listEntities.mock.calls.map(([request]) => request.statusAsOf).at(-1) ?? ''),
      ),
    ).toBe(false);
    expect(
      JSON.parse(
        window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'teams')) ?? '',
      ),
    ).toEqual({
      version: 6,
      filters: {
        parentIds: ['league-a'],
        includeTeamsWithoutLeague: true,
        tiers: [],
        includeLeaguesWithoutTier: false,
        seasons: ['2026'],
        countries: ['Scotland'],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
        sourceNames: ['transfermarkt', 'soccerway', 'worldfootball'],
        statuses: ['new', 'old'],
        customBadgeIds: [],
      },
    });
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 5 active',
    );

    await filterButton.click();
    const reopenedCountryGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-country-chip-grid]' }),
    );
    expect(
      await Promise.all((await reopenedCountryGrid.getRows()).map((row) => row.getText())),
    ).toEqual(['Scotland']);
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Clear all' }))).click();
    expect(router.navigate).toHaveBeenCalledOnce();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(2));
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      leagueIds: [],
      includeTeamsWithoutLeague: false,
      seasons: [],
      countries: [],
      sourceNames: [],
      statuses: [],
      pageIndex: 0,
    });
    expect(
      window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'teams')),
    ).toBeNull();
  });

  it('searches, selects, removes, persists, and clears league country filters', async () => {
    const { api, documentLoader, fixture, loader, router } = await createPage({
      entity: 'leagues',
      options: {
        entity: 'leagues',
        countries: [
          { name: 'England', code: 'GB-ENG' },
          { name: 'Portugal', code: 'PT' },
          { name: 'Scotland', code: 'GB-SCT' },
        ],
        seasons: ['2026'],
      },
    });
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();

    const countryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter leagues by countries"]',
      }),
    );
    await countryAutocomplete.enterText('ENG');
    expect(await countryAutocomplete.getOptions({ text: 'England' })).toHaveLength(1);
    expect(await countryAutocomplete.getOptions({ text: 'Scotland' })).toHaveLength(0);
    await countryAutocomplete.selectOption({ text: 'England' });
    await countryAutocomplete.enterText('sco');
    await countryAutocomplete.selectOption({ text: 'Scotland' });
    expect(await countryAutocomplete.getValue()).toBe('');
    await countryAutocomplete.enterText('ENG');
    expect(await countryAutocomplete.getOptions({ text: 'England' })).toHaveLength(0);
    expect(await countryAutocomplete.getOptions({ text: 'No matching countries' })).toHaveLength(1);
    await countryAutocomplete.blur();

    const countryGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-country-chip-grid]' }),
    );
    const selectedCountries = await countryGrid.getRows();
    expect(await Promise.all(selectedCountries.map((row) => row.getText()))).toEqual([
      'England',
      'Scotland',
    ]);
    const selectedFlagSources = Array.from(
      document.querySelectorAll<HTMLImageElement>('[data-ui-country-chip-grid] img'),
      (image) => image.getAttribute('src'),
    );
    expect(selectedFlagSources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('flags/20x15/gb-eng.png'),
        expect.stringContaining('flags/20x15/gb-sct.png'),
      ]),
    );
    await selectedCountries[0]?.remove();

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledOnce());
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: null,
        season: null,
        country: ['Scotland'],
        nationality: null,
        position: null,
        positionDetail: null,
        foot: null,
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      countries: ['Scotland'],
      pageIndex: 0,
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'leagues')) ?? '',
      ),
    ).toEqual({
      version: 6,
      filters: {
        sourceNames: [],
        statuses: [],
        customBadgeIds: [],
        parentIds: [],
        includeTeamsWithoutLeague: false,
        tiers: [],
        includeLeaguesWithoutTier: false,
        seasons: [],
        countries: ['Scotland'],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
    });
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 1 active',
    );

    await filterButton.click();
    const reopenedCountryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter leagues by countries"]',
      }),
    );
    await reopenedCountryAutocomplete.enterText('por');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Clear all' }))).click();
    expect(await reopenedCountryAutocomplete.getValue()).toBe('');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(2));
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      countries: [],
    });
    expect(
      window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'leagues')),
    ).toBeNull();
  });

  it('filters leagues by assigned tiers and leagues without a tier', async () => {
    const { api, documentLoader, fixture, loader, router } = await createPage({
      entity: 'leagues',
      options: {
        entity: 'leagues',
        countries: [],
        seasons: [],
        tiers: [1, 3],
        hasLeaguesWithoutTier: true,
      },
    });
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();
    const tierSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="Filter leagues by tiers"]' }),
    );
    await tierSelect.open();
    await tierSelect.clickOptions({ text: /Tier 1|Tier 3/ });
    await tierSelect.close();
    await (
      await documentLoader.getHarness(
        MatCheckboxHarness.with({ label: 'Include leagues without a tier' }),
      )
    ).check();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();

    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledOnce());
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: 'true',
        tier: [1, 3],
        teamId: null,
        season: null,
        country: null,
        nationality: null,
        position: null,
        positionDetail: null,
        foot: null,
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      tiers: [1, 3],
      includeLeaguesWithoutTier: true,
    });
    expect(
      JSON.parse(
        window.localStorage.getItem(entityFilterPreferenceKey('project-id', 'leagues')) ?? '',
      ),
    ).toEqual({
      version: 6,
      filters: {
        sourceNames: [],
        statuses: [],
        customBadgeIds: [],
        parentIds: [],
        includeTeamsWithoutLeague: false,
        tiers: [1, 3],
        includeLeaguesWithoutTier: true,
        seasons: [],
        countries: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
        feet: [],
      },
    });
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 1 active',
    );
  });

  it('normalizes stale league country URL filters', async () => {
    const { api, router } = await createPage({
      entity: 'leagues',
      initialQuery: { country: ['England', 'Missing'] },
      options: {
        entity: 'leagues',
        countries: [
          { name: 'England', code: 'GB-ENG' },
          { name: 'Scotland', code: 'GB-SCT' },
        ],
        seasons: [],
      },
    });

    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: null,
        season: null,
        country: ['England'],
        nationality: null,
        position: null,
        positionDetail: null,
        foot: null,
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      countries: ['England'],
    });
  });

  it('normalizes stale team country URL filters', async () => {
    const { api, router } = await createPage({
      entity: 'teams',
      initialQuery: { country: ['England', 'Missing'] },
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [
          { name: 'England', code: 'GB-ENG' },
          { name: 'Scotland', code: 'GB-SCT' },
        ],
        seasons: [],
      },
    });

    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: null,
        season: null,
        country: ['England'],
        nationality: null,
        position: null,
        positionDetail: null,
        foot: null,
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      countries: ['England'],
    });
  });

  it('normalizes stale player URL filters and keeps cancelled edits unapplied', async () => {
    const { api, documentLoader, fixture, loader, queryParams, router } = await createPage({
      entity: 'players',
      initialQuery: {
        sourceName: ['soccerway', 'stale-source'],
        badge: ['new', 'needs-update', 'INVALID'],
        teamId: ['team-a', 'missing-team'],
        nationality: ['Senegal', 'Missing'],
        position: ['ATTACKER', 'INVALID'],
        positionDetail: ['ST', 'INVALID'],
        foot: ['RIGHT'],
      },
      options: {
        entity: 'players',
        sourceNames: ['soccerway', 'transfermarkt'],
        teams: [
          { id: 'team-a', name: 'Alpha FC' },
          { id: 'team-b', name: 'Beta FC' },
        ],
        nationalities: [
          { name: 'Guinea', code: 'GN' },
          { name: 'Senegal', code: 'SN' },
        ],
        positions: ['DEFENDER', 'ATTACKER'],
        positionDetails: ['CB', 'ST'],
        feet: ['LEFT', 'RIGHT'],
      },
    });
    expect(router.navigate).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: ['team-a'],
        season: null,
        country: null,
        nationality: ['Senegal'],
        position: ['ATTACKER'],
        positionDetail: ['ST'],
        foot: ['RIGHT'],
        badge: ['new', 'old'],
        sourceName: ['soccerway'],
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 7 active',
    );
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      sourceNames: ['soccerway'],
      statuses: ['new', 'old'],
    });

    await filterButton.click();
    const teamGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-parent-chip-grid]' }),
    );
    expect(await Promise.all((await teamGrid.getRows()).map((row) => row.getText()))).toEqual([
      'Alpha FC',
    ]);
    const teamAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by teams"]',
      }),
    );
    await teamAutocomplete.enterText('BETA');
    expect(await teamAutocomplete.getOptions({ text: 'Beta FC' })).toHaveLength(1);
    expect(await teamAutocomplete.getOptions({ text: 'Alpha FC' })).toHaveLength(0);
    await teamAutocomplete.selectOption({ text: 'Beta FC' });
    expect(await teamAutocomplete.getValue()).toBe('');
    const nationalityGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({
        selector: '[data-ui-nationality-chip-grid]',
      }),
    );
    expect(
      await Promise.all((await nationalityGrid.getRows()).map((row) => row.getText())),
    ).toEqual(['Senegal']);
    const nationalityAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by nationalities"]',
      }),
    );
    await nationalityAutocomplete.enterText('gui');
    expect(await nationalityAutocomplete.getOptions({ text: 'Guinea' })).toHaveLength(1);
    expect(
      [...document.querySelectorAll<HTMLImageElement>('.mat-mdc-option app-country-flag img')].map(
        (image) => image.getAttribute('src'),
      ),
    ).toEqual(['flags/20x15/gn.png']);
    expect(
      document.querySelector<HTMLImageElement>('mat-chip-row app-country-flag img')?.src,
    ).toContain('flags/20x15/sn.png');
    await nationalityAutocomplete.selectOption({ text: 'Guinea' });
    expect(await nationalityAutocomplete.getValue()).toBe('');
    const positionSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="Filter players by positions"]' }),
    );
    expect(document.querySelector('[data-ui-position-badges]')?.textContent.trim()).toBe('ATT');
    await positionSelect.open();
    expect(await positionSelect.getOptions({ text: 'DEF' })).toHaveLength(1);
    expect(await positionSelect.getOptions({ text: 'ATT' })).toHaveLength(1);
    expect(document.querySelectorAll('.mat-mdc-option app-position-badge')).toHaveLength(2);
    await positionSelect.close();
    const positionDetailSelect = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: 'mat-select[aria-label="Filter players by position details"]',
      }),
    );
    expect(await positionDetailSelect.getValueText()).toBe('ST');
    await positionDetailSelect.open();
    expect(await positionDetailSelect.getOptions({ text: 'CB' })).toHaveLength(1);
    expect(await positionDetailSelect.getOptions({ text: 'ST' })).toHaveLength(1);
    expect(document.querySelectorAll('.mat-mdc-option app-position-detail-badge')).toHaveLength(2);
    await positionDetailSelect.close();
    const footSelect = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: 'mat-select[aria-label="Filter players by preferred foot"]',
      }),
    );
    await footSelect.open();
    await (await footSelect.getOptions({ text: 'Left' }))[0]?.click();
    await footSelect.close();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledOnce();

    queryParams.next(convertToParamMap({ teamId: ['team-b'], nationality: ['Guinea'] }));
    await fixture.whenStable();
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      teamId: 'team-b',
      teamIds: ['team-b'],
      nationalities: ['Guinea'],
      positions: [],
      positionDetails: [],
      feet: [],
      pageIndex: 0,
    });

    queryParams.next(
      convertToParamMap({
        teamId: ['missing-team'],
        position: ['INVALID'],
        badge: ['INVALID'],
      }),
    );
    await fixture.whenStable();
    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: null,
        season: null,
        country: null,
        nationality: null,
        position: null,
        positionDetail: null,
        foot: null,
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('searches, selects, removes, and applies multiple team and nationality filters', async () => {
    const { api, documentLoader, fixture, loader, router } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [
          { id: 'team-a', name: 'Alpha FC' },
          { id: 'team-b', name: 'Beta FC' },
          { id: 'team-c', name: 'Gamma FC' },
        ],
        nationalities: [
          { name: 'Guinea', code: 'GN' },
          { name: 'Senegal', code: 'SN' },
          { name: 'Spain', code: 'ES' },
        ],
        positions: [],
        positionDetails: [],
        feet: [],
      },
    });
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();

    const teamAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by teams"]',
      }),
    );
    await teamAutocomplete.enterText('ALP');
    expect(await teamAutocomplete.getOptions({ text: 'Alpha FC' })).toHaveLength(1);
    expect(await teamAutocomplete.getOptions({ text: 'Beta FC' })).toHaveLength(0);
    await teamAutocomplete.selectOption({ text: 'Alpha FC' });
    await teamAutocomplete.enterText('beta');
    await teamAutocomplete.selectOption({ text: 'Beta FC' });
    expect(await teamAutocomplete.getValue()).toBe('');
    await teamAutocomplete.enterText('BETA');
    expect(await teamAutocomplete.getOptions({ text: 'Beta FC' })).toHaveLength(0);
    expect(await teamAutocomplete.getOptions({ text: 'No matching teams' })).toHaveLength(1);
    await teamAutocomplete.blur();

    const teamGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-parent-chip-grid]' }),
    );
    const selectedTeams = await teamGrid.getRows();
    expect(await Promise.all(selectedTeams.map((row) => row.getText()))).toEqual([
      'Alpha FC',
      'Beta FC',
    ]);
    await selectedTeams[0]?.remove();

    const nationalityAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by nationalities"]',
      }),
    );
    await nationalityAutocomplete.enterText('gui');
    await nationalityAutocomplete.selectOption({ text: 'Guinea' });
    await nationalityAutocomplete.enterText('SEN');
    await nationalityAutocomplete.selectOption({ text: 'Senegal' });
    const nationalityGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({
        selector: '[data-ui-nationality-chip-grid]',
      }),
    );
    const selectedNationalities = await nationalityGrid.getRows();
    expect(await Promise.all(selectedNationalities.map((row) => row.getText()))).toEqual([
      'Guinea',
      'Senegal',
    ]);
    await selectedNationalities[0]?.remove();

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledOnce());
    expect(router.navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: {
        leagueId: null,
        noLeague: null,
        noTier: null,
        tier: null,
        teamId: ['team-b'],
        season: null,
        country: null,
        nationality: ['Senegal'],
        position: null,
        positionDetail: null,
        foot: null,
        badge: null,
        sourceName: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(api.listEntities.mock.calls.map(([request]) => request).at(-1)).toMatchObject({
      teamId: 'team-b',
      teamIds: ['team-b'],
      nationalities: ['Senegal'],
    });

    await filterButton.click();
    const reopenedTeamAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by teams"]',
      }),
    );
    const reopenedNationalityAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by nationalities"]',
      }),
    );
    await reopenedTeamAutocomplete.enterText('gam');
    await reopenedNationalityAutocomplete.enterText('spa');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Clear all' }))).click();
    expect(await reopenedTeamAutocomplete.getValue()).toBe('');
    expect(await reopenedNationalityAutocomplete.getValue()).toBe('');
  });

  it('keeps legacy string nationality options visible', async () => {
    const { documentLoader, loader } = await createPage({
      entity: 'players',
      options: {
        entity: 'players',
        teams: [],
        nationalities: ['Guinea', 'Senegal'],
        positions: [],
        positionDetails: [],
        feet: [],
      } as unknown as EntityFilterOptions,
    });
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
    ).click();
    const nationalityAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter players by nationalities"]',
      }),
    );
    await nationalityAutocomplete.focus();
    expect(await nationalityAutocomplete.getOptions({ text: 'Guinea' })).toHaveLength(1);
    expect(await nationalityAutocomplete.getOptions({ text: 'Senegal' })).toHaveLength(1);
  });

  it('keeps the table available and retries filter-option loading errors', async () => {
    const api = {
      getProjectSummary: vi.fn(() =>
        Promise.resolve({ ok: true as const, value: projectSummary() }),
      ),
      listEntities: vi.fn((request: PageRequest) =>
        Promise.resolve({
          ok: true as const,
          value: { rows: [], total: 0, pageIndex: request.pageIndex, pageSize: request.pageSize },
        }),
      ),
      listEntityFilterOptions: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false as const,
          error: { code: 'DATABASE' as const, message: 'Options unavailable' },
        })
        .mockResolvedValueOnce({
          ok: true as const,
          value: { entity: 'leagues' as const, countries: [], seasons: ['2026'] },
        }),
    };
    await TestBed.configureTestingModule({
      imports: [EntityTablePage],
      providers: [
        provideNullable(),
        { provide: DesktopApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { snapshot: { paramMap: convertToParamMap({ projectId: 'project-id' }) } },
            snapshot: { data: { entity: 'leagues' } },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EntityTablePage);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const documentLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
    ).click();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    expect(overlay?.querySelector('[role="alert"]')?.textContent).toContain(
      'Filters could not be loaded: Options unavailable',
    );
    expect(element.textContent).toContain('0 records');

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Retry' }))).click();
    await fixture.whenStable();
    expect(api.listEntityFilterOptions).toHaveBeenCalledTimes(2);
    expect(overlay?.querySelector('[role="alert"]')).toBeNull();
    const select = await documentLoader.getHarness(MatSelectHarness);
    expect(await select.isDisabled()).toBe(false);
  });

  it.each<{ state: string; initialQuery: Record<string, string | string[]> }>([
    { state: 'empty', initialQuery: {} },
    {
      state: 'selected',
      initialQuery: { teamId: ['team-a'], nationality: ['Senegal'] },
    },
  ])(
    'has no detectable AXE violations with the $state filter drawer open',
    async ({ initialQuery }) => {
      const { fixture, loader } = await createPage({
        entity: 'players',
        initialQuery,
        options: {
          entity: 'players',
          teams: [{ id: 'team-a', name: 'Alpha FC' }],
          nationalities: [{ name: 'Senegal', code: 'SN' }],
          positions: ['ATTACKER'],
          positionDetails: ['ST'],
          feet: ['RIGHT'],
        },
      });
      await (
        await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
      ).click();
      await fixture.whenStable();

      const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
      if (!overlay) throw new Error('Filter drawer overlay was not created.');
      const results = await axe.run(overlay);
      expect(results.violations).toEqual([]);
    },
  );

  it('has no detectable AXE violations with a selected league filter', async () => {
    const { fixture, loader } = await createPage({
      entity: 'teams',
      initialQuery: { leagueId: ['league-a'] },
      options: {
        entity: 'teams',
        leagues: [{ id: 'league-a', name: 'League A' }],
        hasTeamsWithoutLeague: false,
        countries: [],
        seasons: [],
      },
    });
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
    ).click();
    await fixture.whenStable();

    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Filter drawer overlay was not created.');
    const results = await axe.run(overlay);
    expect(results.violations).toEqual([]);
  });

  it('has no detectable AXE violations with a selected team country filter', async () => {
    const { fixture, loader } = await createPage({
      entity: 'teams',
      initialQuery: { country: ['England'] },
      options: {
        entity: 'teams',
        leagues: [],
        hasTeamsWithoutLeague: false,
        countries: [{ name: 'England', code: 'GB-ENG' }],
        seasons: [],
      },
    });
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
    ).click();
    await fixture.whenStable();

    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Filter drawer overlay was not created.');
    const results = await axe.run(overlay);
    expect(results.violations).toEqual([]);
  });

  it('has no detectable AXE violations with the columns drawer open', async () => {
    const { fixture, loader } = await createPage({
      entity: 'leagues',
      options: { entity: 'leagues', countries: [], seasons: [] },
    });
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-column-button]' }))
    ).click();
    await fixture.whenStable();

    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Columns drawer overlay was not created.');
    const results = await axe.run(overlay);
    expect(results.violations).toEqual([]);
  });
});
