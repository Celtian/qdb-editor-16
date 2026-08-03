import { TestKey } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatChipGridHarness } from '@angular/material/chips/testing';
import { MatDialogHarness } from '@angular/material/dialog/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableHarness } from '@angular/material/table/testing';
import { MatTooltipHarness } from '@angular/material/tooltip/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import axe from 'axe-core';

import type {
  CombinedEntity,
  CombinedEntityFilterOptions,
  CombinedEntityKind,
  CombinedLeague,
  CombinedPageRequest,
  CombinedPlayer,
  CombinedTeam,
} from '../../../../../shared/downloader/contracts';
import { formatReferenceDate } from '../../../../../shared/downloader/reference-date';
import { formatEuroCurrency, formatUiTimestamp } from '../../../../../shared/downloader/ui-format';
import { DesktopApi } from '../../../core/downloader-api';
import { emptyCombinedEntityFilters } from '../combined-entity-filter-drawer/combined-entity-filter-drawer';
import { combinedEntityColumnPreferenceKey } from './combined-entity-column-preferences';
import { defaultCombinedColumnPreference } from './combined-entity-columns';
import { combinedEntityFilterPreferenceKey } from './combined-entity-filter-preferences';
import { CombinedEntityPage } from './combined-entity-page';

const timestamps = {
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
};
const combinedBadge = {
  id: 'combined-badge-review',
  name: 'Manual review',
  description: 'Needs manual canonical review',
  color: 'purple' as const,
};

const league = (overrides: Partial<CombinedLeague> = {}): CombinedLeague => ({
  id: 'league-1',
  projectId: 'project-id',
  name: 'Premier League',
  teamCount: 20,
  sources: [],
  needsReview: false,
  ...timestamps,
  ...overrides,
});

const team = (overrides: Partial<CombinedTeam> = {}): CombinedTeam => ({
  id: 'team-1',
  projectId: 'project-id',
  leagueId: 'league-1',
  leagueName: 'Premier League',
  name: 'Sparta Prague',
  sources: [],
  needsReview: false,
  ...timestamps,
  ...overrides,
});

const player = (overrides: Partial<CombinedPlayer> = {}): CombinedPlayer => ({
  id: 'player-1',
  projectId: 'project-id',
  teamId: 'team-1',
  teamName: 'Sparta Prague',
  name: 'Adam Example',
  sources: [],
  needsReview: false,
  ...timestamps,
  ...overrides,
});

const combinedFilterOptions = (entity: CombinedEntityKind): CombinedEntityFilterOptions =>
  entity === 'leagues'
    ? {
        entity,
        countries: [
          { name: 'Czechia', code: 'cz' },
          { name: 'England', code: 'gb-eng' },
        ],
        tiers: [1, 2],
        hasLeaguesWithoutTier: true,
        customBadges: [combinedBadge],
      }
    : entity === 'teams'
      ? {
          entity,
          leagues: [
            { id: 'league-1', name: 'Premier League' },
            { id: 'league-2', name: 'Czech First League' },
          ],
          hasTeamsWithoutLeague: true,
          countries: [
            { name: 'Czechia', code: 'cz' },
            { name: 'England', code: 'gb-eng' },
          ],
          customBadges: [combinedBadge],
        }
      : {
          entity,
          teams: [
            { id: 'team-1', name: 'Sparta Prague' },
            { id: 'team-2', name: 'Arsenal' },
          ],
          nationalities: [
            { name: 'Czechia', code: 'cz' },
            { name: 'Senegal', code: 'sn' },
          ],
          positions: ['DEFENDER', 'ATTACKER'],
          positionDetails: ['CB', 'ST'],
          feet: ['LEFT', 'RIGHT'],
          customBadges: [combinedBadge],
        };

const queryString = (query: Record<string, string | readonly string[]>): string => {
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const item of typeof value === 'string' ? [value] : value) {
      parameters.append(name, item);
    }
  }
  const value = parameters.toString();
  return value ? `?${value}` : '';
};

const showCombinedColumns = (entity: CombinedEntityKind, columns: readonly string[]): void => {
  const defaults = defaultCombinedColumnPreference(entity);
  window.localStorage.setItem(
    combinedEntityColumnPreferenceKey(entity),
    JSON.stringify({
      ...defaults,
      visible: [...new Set([...defaults.visible, ...columns])],
    }),
  );
};

const renderPage = async (
  entity: CombinedEntityKind,
  rows: CombinedEntity[],
  total = rows.length,
  loadError?: string,
  filterOptionsError?: string,
  initialQuery: Record<string, string | readonly string[]> = {},
) => {
  const api = {
    listCombinedEntities: vi.fn((request: CombinedPageRequest) => {
      void request;
      if (loadError) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'DATABASE' as const, message: loadError },
        });
      }
      return Promise.resolve({
        ok: true as const,
        value: {
          rows,
          total,
          pageIndex: 0,
          pageSize: 25,
        },
      });
    }),
    listCombinedEntityFilterOptions: vi.fn(
      ({ entity: requestedEntity }: { entity: CombinedEntityKind }) =>
        filterOptionsError
          ? Promise.resolve({
              ok: false as const,
              error: { code: 'DATABASE' as const, message: filterOptionsError },
            })
          : Promise.resolve({
              ok: true as const,
              value: combinedFilterOptions(requestedEntity),
            }),
    ),
    deleteCombinedEntity: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: {},
      }),
    ),
    deleteCombinedLeagues: vi.fn(
      (): Promise<
        | { ok: true; value: Record<string, never> }
        | { ok: false; error: { code: 'DATABASE'; message: string } }
      > =>
        Promise.resolve({
          ok: true,
          value: {},
        }),
    ),
    deleteCombinedTeams: vi.fn(
      (): Promise<
        | { ok: true; value: Record<string, never> }
        | { ok: false; error: { code: 'DATABASE'; message: string } }
      > =>
        Promise.resolve({
          ok: true,
          value: {},
        }),
    ),
    deleteCombinedPlayers: vi.fn(
      (): Promise<
        | { ok: true; value: Record<string, never> }
        | { ok: false; error: { code: 'DATABASE'; message: string } }
      > =>
        Promise.resolve({
          ok: true,
          value: {},
        }),
    ),
    updateCombinedEntityCustomBadges: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { updatedEntityCount: 1 },
      }),
    ),
  };
  const snackBar = { open: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [CombinedEntityPage],
    providers: [
      provideRouter([
        {
          path: 'projects/:projectId',
          children: (['leagues', 'teams', 'players'] as const).map((routeEntity) => ({
            path: `combined/${routeEntity}`,
            component: CombinedEntityPage,
            data: { entity: routeEntity },
          })),
        },
      ]),
      { provide: DesktopApi, useValue: api },
      { provide: MatSnackBar, useValue: snackBar },
    ],
  }).compileComponents();
  const harness = await RouterTestingHarness.create(
    `/projects/project-id/combined/${entity}${queryString(initialQuery)}`,
  );
  const fixture = harness.fixture;
  const router = TestBed.inject(Router);
  await fixture.whenStable();

  return {
    api,
    documentLoader: TestbedHarnessEnvironment.documentRootLoader(fixture),
    element: fixture.nativeElement as HTMLElement,
    fixture,
    harness,
    loader: TestbedHarnessEnvironment.loader(fixture),
    router,
    snackBar,
  };
};

describe('CombinedEntityPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses the source-table card structure and player table sizing', async () => {
    const { element, loader } = await renderPage('players', []);
    const card = element.querySelector('mat-card');
    const table = element.querySelector('table');
    const emptyCell = element.querySelector<HTMLTableCellElement>('[data-ui-empty-row] td');

    expect(card).not.toBeNull();
    expect(element.querySelector('app-page-header mat-icon')?.textContent?.trim()).toBe('groups');
    expect(element.querySelector('h1')?.textContent).toContain('Players');
    expect(card?.querySelector('[data-ui-table-toolbar]')).not.toBeNull();
    expect(card?.querySelector('[data-ui-table-scroll]')).not.toBeNull();
    expect(card?.contains(table)).toBe(true);
    expect(card?.querySelector('mat-paginator')).not.toBeNull();
    expect(element.querySelector('.table-wrapper')).toBeNull();
    expect(table?.classList.contains('player-table')).toBe(true);
    expect(emptyCell?.colSpan).toBe(14);
    expect(emptyCell?.textContent).toContain('No project players match the current filters.');
    expect(await (await loader.getHarness(MatPaginatorHarness)).getPageSize()).toBe(25);
  });

  it('applies, persists, cancels, and resets combined column layouts from the finder', async () => {
    const { documentLoader, element, fixture, loader } = await renderPage('players', [player()]);
    const columnButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-column-button]' }),
    );
    expect(await (await columnButton.host()).getAttribute('aria-label')).toBe(
      'Choose columns, 4 hidden',
    );

    await columnButton.click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getAriaLabelledby()).toBe('entity-column-title');
    const name = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Name' }));
    const actions = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Actions' }));
    const badges = await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Badges' }));
    expect(await name.isDisabled()).toBe(true);
    expect(await actions.isDisabled()).toBe(true);
    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Combined columns drawer overlay was not created.');
    expect((await axe.run(overlay)).violations).toEqual([]);

    await badges.check();
    const badgeHandle = await documentLoader.getHarness(
      MatButtonHarness.with({ selector: 'button[aria-label="Reorder Badges column"]' }),
    );
    await (await badgeHandle.host()).sendKeys(TestKey.DOWN_ARROW);
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();

    await vi.waitFor(() => expect(element.querySelector('.mat-column-badge')).not.toBeNull());
    expect(await (await columnButton.host()).getAttribute('aria-label')).toBe(
      'Choose columns, 3 hidden',
    );
    const stored = JSON.parse(
      window.localStorage.getItem(combinedEntityColumnPreferenceKey('players')) ?? '{}',
    ) as { order: string[]; visible: string[] };
    expect(stored.order.slice(0, 4)).toEqual(['name', 'parent', 'badge', 'sources']);
    expect(stored.visible).toContain('badge');

    await columnButton.click();
    await (await documentLoader.getHarness(MatCheckboxHarness.with({ label: 'Badges' }))).uncheck();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    await fixture.whenStable();
    expect(element.querySelector('.mat-column-badge')).not.toBeNull();

    await columnButton.click();
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Reset to defaults' }))
    ).click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(element.querySelector('.mat-column-badge')).toBeNull());
    expect(element.querySelector('.mat-column-select')).not.toBeNull();
    expect(await (await columnButton.host()).getAttribute('aria-label')).toBe(
      'Choose columns, 4 hidden',
    );
  });

  it('shows the optional created timestamp before the updated timestamp', async () => {
    const createdAt = '2026-01-01T10:00:00.000Z';
    const updatedAt = '2026-01-02T10:00:00.000Z';
    showCombinedColumns('players', ['created', 'updated']);

    const { loader } = await renderPage('players', [player({ createdAt, updatedAt })]);
    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    const headerText = await header.getCellTextByIndex();
    const rowText = await (await table.getRows())[0].getCellTextByColumnName();
    const normalizeWhitespace = (value: string | undefined): string | undefined =>
      value?.replace(/\s/g, ' ');

    expect(headerText.indexOf('Created')).toBe(headerText.indexOf('Updated') - 1);
    expect(normalizeWhitespace(rowText['created'])).toBe(formatUiTimestamp(createdAt));
    expect(normalizeWhitespace(rowText['updated'])).toBe(formatUiTimestamp(updatedAt));
  });

  it('links a combined league name to its filtered teams', async () => {
    const { api, element, fixture, router } = await renderPage('leagues', [league()]);
    const nameLink = element.querySelector<HTMLAnchorElement>('.mat-column-name a');

    expect(nameLink?.textContent).toContain('Premier League');
    expect(nameLink?.getAttribute('href')).toBe(
      '/projects/project-id/combined/teams?leagueId=league-1',
    );

    nameLink?.click();
    await fixture.whenStable();

    expect(router.url).toBe('/projects/project-id/combined/teams?leagueId=league-1');
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entity: 'teams',
        leagueIds: ['league-1'],
      }),
    );
  });

  it('links a combined team name to its filtered players', async () => {
    const { api, element, fixture, router } = await renderPage('teams', [team()]);
    const nameLink = element.querySelector<HTMLAnchorElement>('.mat-column-name a');

    expect(nameLink?.textContent).toContain('Sparta Prague');
    expect(nameLink?.getAttribute('href')).toBe(
      '/projects/project-id/combined/players?teamId=team-1',
    );

    nameLink?.click();
    await fixture.whenStable();

    expect(router.url).toBe('/projects/project-id/combined/players?teamId=team-1');
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entity: 'players',
        teamIds: ['team-1'],
      }),
    );
  });

  it('keeps combined player names as plain text', async () => {
    const { element } = await renderPage('players', [player()]);
    const nameCell = element.querySelector<HTMLElement>('tbody .mat-column-name');

    expect(nameCell?.textContent).toContain('Adam Example');
    expect(nameCell?.querySelector('a')).toBeNull();
  });

  it('reacts to direct and subsequent parent-filter URL changes', async () => {
    const { api, fixture, harness } = await renderPage('teams', [team()], 1, undefined, undefined, {
      leagueId: ['league-1'],
    });

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ leagueIds: ['league-1'] }),
    );

    await harness.navigateByUrl('/projects/project-id/combined/teams?leagueId=league-2');
    await fixture.whenStable();
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ leagueIds: ['league-2'], pageIndex: 0 }),
    );

    await harness.navigateByUrl('/projects/project-id/combined/teams');
    await fixture.whenStable();
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('leagueIds');
  });

  it('keeps load feedback inside the table card', async () => {
    const { element } = await renderPage('leagues', [], 0, 'Combined leagues unavailable.');
    const card = element.querySelector('mat-card');
    const error = element.querySelector<HTMLElement>('[role="alert"]');

    expect(error?.textContent).toContain('Combined leagues unavailable.');
    expect(card?.contains(error)).toBe(true);
  });

  it('shows country and tier metadata for combined leagues', async () => {
    const { element, loader } = await renderPage('leagues', [
      league({
        countryName: 'England',
        countryCode2: 'GB',
        countryCode3: 'ENG',
        tier: 1,
      }),
      league({ id: 'league-2', name: 'Unknown League', teamCount: undefined }),
    ]);
    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    const rows = await table.getRows();

    expect(await header.getCellTextByIndex()).toEqual([
      '',
      'Name',
      'Sources',
      'Country',
      'Tier',
      'Teams',
      'Actions',
    ]);
    expect(await rows[0].getCellTextByColumnName()).toMatchObject({
      country: 'England',
      parent: '20',
      tier: '1',
    });
    expect(await rows[1].getCellTextByColumnName()).toMatchObject({
      country: '—',
      parent: '0',
      tier: '—',
    });

    const renderedRows = element.querySelectorAll('tbody tr');
    const flag = renderedRows[0].querySelector<HTMLImageElement>('app-country-flag img');
    expect(flag?.getAttribute('alt')).toBe('');
    expect(flag?.getAttribute('src')).toContain('flags/20x15/gb-eng.png');
    expect(renderedRows[1].querySelector('app-country-flag')).toBeNull();
    expect(element.querySelector('.mat-column-select')).not.toBeNull();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('shows country and player counts without player metadata columns for combined teams', async () => {
    const { element, loader } = await renderPage('teams', [
      team({
        countryName: 'Czech Republic',
        countryCode2: 'CZ',
        countryCode3: 'CZE',
        playerCount: 24,
      }),
      team({ id: 'team-2', name: 'Reserve Team' }),
    ]);
    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    const rows = await table.getRows();

    expect(await header.getCellTextByIndex()).toEqual([
      '',
      'Name',
      'Sources',
      'Country',
      'Players',
      'Actions',
    ]);
    expect(await rows[0].getCellTextByColumnName()).toMatchObject({
      country: 'Czech Republic',
      playerCount: '24',
    });
    expect(await rows[1].getCellTextByColumnName()).toMatchObject({
      playerCount: '0',
    });
    expect(element.querySelector('.mat-column-tier')).toBeNull();
    expect(element.querySelector('.mat-column-jerseyNumber')).toBeNull();
    expect(element.querySelector('.mat-column-select')).not.toBeNull();
    expect(
      element.querySelector<HTMLImageElement>('.mat-column-country app-country-flag img')?.src,
    ).toContain('flags/20x15/cz.png');
  });

  it('links team import and recombination actions to the unified Import route', async () => {
    const { documentLoader, element, loader } = await renderPage('teams', [team()]);
    const importLink = element.querySelector<HTMLAnchorElement>('app-page-header a');

    expect(importLink?.textContent).toContain('Import teams');
    expect(importLink?.getAttribute('href')).toBe('/projects/project-id/combined/import');

    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: '[aria-label="Actions for Sparta Prague"]' }),
      )
    ).click();
    const menu = await documentLoader.getHarness(MatMenuHarness);
    expect(await (await menu.getItems({ text: /Recombine team/ }))[0].getText()).toContain(
      'Recombine team',
    );
    expect(
      document
        .querySelector<HTMLAnchorElement>('.mat-mdc-menu-panel a[href]')
        ?.getAttribute('href'),
    ).toBe('/projects/project-id/combined/import?teamId=team-1');
  });

  it('shows accessible status badges with team-specific tooltips', async () => {
    showCombinedColumns('teams', ['badge']);
    const { element, loader } = await renderPage('teams', [
      team(),
      team({ id: 'team-2', name: 'Missing Sources', needsReview: true }),
    ]);
    const table = await loader.getHarness(MatTableHarness);
    const rows = await table.getRows();

    expect((await rows[0].getCellTextByColumnName())['badge']).toContain('Ready');
    expect((await rows[1].getCellTextByColumnName())['badge']).toContain('Needs review');

    const readyBadge = element.querySelector<HTMLElement>('[data-status="ready"]');
    const needsReviewBadge = element.querySelector<HTMLElement>('[data-status="needsReview"]');
    expect(readyBadge?.getAttribute('tabindex')).toBe('0');
    expect(readyBadge?.querySelector('mat-icon')?.textContent.trim()).toBe('check_circle');
    expect(needsReviewBadge?.getAttribute('tabindex')).toBe('0');
    expect(needsReviewBadge?.querySelector('mat-icon')?.textContent.trim()).toBe('warning');

    const readyTooltip = await loader.getHarness(
      MatTooltipHarness.with({ selector: '[data-status="ready"]' }),
    );
    await readyTooltip.show();
    expect(await readyTooltip.getTooltipText()).toBe(
      'All source teams and players linked to this project team are still available.',
    );
    await readyTooltip.hide();

    const needsReviewTooltip = await loader.getHarness(
      MatTooltipHarness.with({ selector: '[data-status="needsReview"]' }),
    );
    await needsReviewTooltip.show();
    expect(await needsReviewTooltip.getTooltipText()).toBe(
      'One or more source teams or players linked to this project team are missing. Review this project team.',
    );
    await needsReviewTooltip.hide();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('renders combined custom badges and updates them for selected rows', async () => {
    showCombinedColumns('players', ['badge']);
    const { api, documentLoader, element, fixture, loader } = await renderPage('players', [
      player({ customBadges: [combinedBadge] }),
      player({ id: 'player-2', name: 'Bea Example' }),
    ]);
    expect(element.querySelector('.mat-column-badge app-custom-badge')?.textContent).toContain(
      'Manual review',
    );

    const rowCheckboxes = await loader.getAllHarnesses(
      MatCheckboxHarness.with({ selector: '[data-ui-row-select-checkbox]' }),
    );
    await rowCheckboxes[0].check();
    await rowCheckboxes[1].check();
    await fixture.whenStable();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-badges-button]' }))
    ).click();
    const badgeCheckbox = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: /Manual review/ }),
    );
    expect(await badgeCheckbox.isIndeterminate()).toBe(true);
    await badgeCheckbox.check();
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply badges' }))
    ).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.updateCombinedEntityCustomBadges).toHaveBeenCalledWith({
        projectId: 'project-id',
        entity: 'players',
        ids: ['player-1', 'player-2'],
        addBadgeIds: ['combined-badge-review'],
        removeBadgeIds: [],
      }),
    );
  });

  it('updates combined custom badges from a row action', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage('players', [player()]);
    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: '[aria-label="Actions for Adam Example"]' }),
      )
    ).click();
    const menu = await documentLoader.getHarness(MatMenuHarness);
    await (await menu.getItems({ text: /Manage badges/ }))[0].click();
    const badgeCheckbox = await documentLoader.getHarness(
      MatCheckboxHarness.with({ label: /Manual review/ }),
    );
    await badgeCheckbox.check();
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply badges' }))
    ).click();
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(api.updateCombinedEntityCustomBadges).toHaveBeenCalledWith({
        projectId: 'project-id',
        entity: 'players',
        ids: ['player-1'],
        addBadgeIds: ['combined-badge-review'],
        removeBadgeIds: [],
      }),
    );
  });

  it.each([
    {
      entity: 'leagues' as const,
      row: league({ needsReview: true }),
      tooltip:
        'One or more source leagues linked to this project league are missing. Review this project league.',
    },
    {
      entity: 'players' as const,
      row: player({ needsReview: true }),
      tooltip:
        'One or more source players linked to this project player are missing. Review this project player.',
    },
  ])('uses the $entity-specific review explanation', async ({ entity, row, tooltip }) => {
    showCombinedColumns(entity, ['badge']);
    const { loader } = await renderPage(entity, [row]);
    const statusTooltip = await loader.getHarness(
      MatTooltipHarness.with({ selector: '[data-status="needsReview"]' }),
    );

    await statusTooltip.show();
    expect(await statusTooltip.getTooltipText()).toBe(tooltip);
  });

  it('shows formatted player metadata and placeholders for missing values', async () => {
    const { element, loader } = await renderPage('players', [
      player({
        countryName: 'Senegal',
        countryCode2: 'SN',
        countryCode3: 'SEN',
        jerseyNumber: 9,
        position: 'ATTACKER',
        positionDetail: 'ST',
        birthdate: '1995-03-14',
        height: 183,
        foot: 'RIGHT',
        joined: '2024-07-01',
        contractExpires: '2027-06-30',
        marketValue: 12_500_000,
      }),
      player({
        id: 'player-2',
        name: 'Unknown Player',
      }),
    ]);
    const table = await loader.getHarness(MatTableHarness);
    const header = (await table.getHeaderRows())[0];
    const rows = await table.getRows();

    expect(await header.getCellTextByIndex()).toEqual([
      '',
      'Name',
      'Sources',
      'Country',
      'Number',
      'Position',
      'Position detail',
      'Birth date',
      'Height',
      'Foot',
      'Joined',
      'Contract until',
      'Market value',
      'Actions',
    ]);
    expect(await rows[0].getCellTextByColumnName()).toMatchObject({
      country: 'Senegal',
      jerseyNumber: '9',
      position: 'ATT',
      positionDetail: 'ST',
      birthdate: formatReferenceDate('1995-03-14'),
      height: '183 cm',
      foot: 'Right',
      joined: formatReferenceDate('2024-07-01'),
      contractExpires: formatReferenceDate('2027-06-30'),
      marketValue: formatEuroCurrency(12_500_000),
    });
    expect(await rows[1].getCellTextByColumnName()).toMatchObject({
      country: '—',
      jerseyNumber: '—',
      position: '—',
      positionDetail: '—',
      birthdate: '—',
      height: '—',
      foot: '—',
      joined: '—',
      contractExpires: '—',
      marketValue: '—',
    });

    const renderedRows = element.querySelectorAll('tbody tr');
    expect(
      renderedRows[0].querySelector('.mat-column-position abbr')?.getAttribute('aria-label'),
    ).toBe('Attacker');
    expect(
      renderedRows[0].querySelector('.mat-column-positionDetail abbr')?.getAttribute('aria-label'),
    ).toBe('Detailed position ST');
    expect(
      renderedRows[0].querySelector<HTMLImageElement>('.mat-column-country app-country-flag img')
        ?.src,
    ).toContain('flags/20x15/sn.png');
    expect(element.querySelector('.mat-column-tier')).toBeNull();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('selects individual or all visible combined players accessibly', async () => {
    const { element, fixture, loader } = await renderPage('players', [
      player(),
      player({ id: 'player-2', name: 'Bea Example' }),
    ]);
    const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
    const selectAll = checkboxes[0];
    const firstPlayer = checkboxes[1];

    expect(checkboxes).toHaveLength(3);
    expect(await selectAll.getAriaLabel()).toBe('Select all project players on this page');
    expect(await firstPlayer.getAriaLabel()).toBe('Select Adam Example');

    await firstPlayer.check();
    await fixture.whenStable();

    expect(await selectAll.isIndeterminate()).toBe(true);
    expect(element.querySelector('[data-ui-selection-footer]')?.textContent).toContain(
      '1 player selected',
    );
    expect(element.querySelectorAll('tr.selected-row')).toHaveLength(1);
    expect((await axe.run(element)).violations).toEqual([]);

    await selectAll.check();
    await fixture.whenStable();
    expect(element.querySelector('[data-ui-selection-footer]')?.textContent).toContain(
      '2 players selected',
    );
    expect(element.querySelectorAll('tr.selected-row')).toHaveLength(2);

    await selectAll.uncheck();
    await fixture.whenStable();
    expect(element.querySelector('[data-ui-selection-footer]')).toBeNull();
  });

  it('keeps the existing row-menu deletion for a combined player', async () => {
    const { api, documentLoader, fixture, loader, snackBar } = await renderPage('players', [
      player(),
    ]);
    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: '[aria-label="Actions for Adam Example"]' }),
      )
    ).click();
    const menu = await documentLoader.getHarness(MatMenuHarness);
    await (await menu.getItems({ text: /Delete/ }))[0].click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);

    expect(await dialog.getTitleText()).toBe('Delete project player');
    expect(await dialog.getText()).toContain('Raw source records are not affected.');
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: /^Delete$/ }))).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.deleteCombinedEntity).toHaveBeenCalledWith(
        'project-id',
        'players',
        'player-1',
        false,
      ),
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Adam Example deleted. Source data was preserved.',
      'Dismiss',
      { duration: 4000 },
    );
  });

  it('selects and atomically deletes combined leagues with detach or cascade behavior', async () => {
    const { api, documentLoader, element, fixture, loader, snackBar } = await renderPage(
      'leagues',
      [
        league({ teamCount: 2, playerCount: 5 }),
        league({
          id: 'league-2',
          name: 'Czech First League',
          teamCount: 3,
          playerCount: 7,
        }),
      ],
    );
    const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
    expect(await checkboxes[0].getAriaLabel()).toBe('Select all project leagues on this page');
    await checkboxes[0].check();
    await fixture.whenStable();

    expect(element.querySelector('[data-ui-selection-footer]')?.textContent).toContain(
      '2 leagues selected',
    );
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Delete selected project leagues?');
    expect(await dialog.getText()).toContain('5 project teams');
    expect(await dialog.getText()).toContain('12 project players');
    expect(await dialog.getText()).toContain('Raw source records are not affected.');
    const radioButtons = await documentLoader.getAllHarnesses(MatRadioButtonHarness);
    expect(await radioButtons[0].isChecked()).toBe(true);
    await radioButtons[1].check();
    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Bulk league deletion dialog overlay was not created.');
    expect((await axe.run(overlay)).violations).toEqual([]);

    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Delete 2 project leagues' }))
    ).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.deleteCombinedLeagues).toHaveBeenCalledWith(
        'project-id',
        ['league-1', 'league-2'],
        true,
      ),
    );
    expect(api.listCombinedEntityFilterOptions).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[data-ui-selection-footer]')).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith(
      '2 project leagues deleted. Source data was preserved.',
      'Dismiss',
      { duration: 4000 },
    );
  });

  it('selects and atomically deletes combined teams with their project players', async () => {
    const { api, documentLoader, element, fixture, loader } = await renderPage('teams', [
      team({ playerCount: 4 }),
    ]);
    const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
    expect(await checkboxes[0].getAriaLabel()).toBe('Select all project teams on this page');
    expect(await checkboxes[1].getAriaLabel()).toBe('Select Sparta Prague');
    await checkboxes[1].check();
    await fixture.whenStable();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    const dialog = await documentLoader.getHarness(MatDialogHarness);

    expect(await dialog.getTitleText()).toBe('Delete selected project team?');
    expect(await dialog.getText()).toContain('1 project team selected');
    expect(await dialog.getText()).toContain('4 project players');
    expect(await dialog.getText()).toContain('Raw source records are not affected.');
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Delete 1 project team' }))
    ).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.deleteCombinedTeams).toHaveBeenCalledWith('project-id', ['team-1']),
    );
    expect(element.querySelector('[data-ui-selection-footer]')).toBeNull();
  });

  it('confirms and atomically deletes selected combined players', async () => {
    const { api, documentLoader, element, fixture, loader, snackBar } = await renderPage(
      'players',
      [player(), player({ id: 'player-2', name: 'Bea Example' })],
    );
    const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
    await checkboxes[1].check();
    await checkboxes[2].check();
    await fixture.whenStable();
    const deleteButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }),
    );

    await deleteButton.click();
    let dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getRole()).toBe('alertdialog');
    expect(await dialog.getTitleText()).toBe('Delete selected project players?');
    expect(await dialog.getText()).toContain('2 project players selected');
    expect(await dialog.getText()).toContain('Raw source records are not affected.');
    expect(await dialog.getText()).toContain('This action cannot be undone.');
    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Bulk deletion dialog overlay was not created.');
    expect((await axe.run(overlay)).violations).toEqual([]);

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    await fixture.whenStable();
    expect(api.deleteCombinedPlayers).not.toHaveBeenCalled();
    expect(element.querySelector('[data-ui-selection-footer]')?.textContent).toContain(
      '2 players selected',
    );

    await deleteButton.click();
    dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getTitleText()).toBe('Delete selected project players?');
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Delete 2 project players' }))
    ).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.deleteCombinedPlayers).toHaveBeenCalledWith('project-id', [
        'player-1',
        'player-2',
      ]),
    );
    expect(element.querySelector('[data-ui-selection-footer]')).toBeNull();
    expect(snackBar.open).toHaveBeenCalledWith(
      '2 project players deleted. Source data was preserved.',
      'Dismiss',
      { duration: 4000 },
    );
  });

  it('keeps selected players available when bulk deletion fails', async () => {
    const { api, documentLoader, element, fixture, loader, snackBar } = await renderPage(
      'players',
      [player()],
    );
    api.deleteCombinedPlayers.mockResolvedValueOnce({
      ok: false,
      error: { code: 'DATABASE', message: 'Combined players could not be deleted.' },
    });
    const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
    await checkboxes[1].check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Delete 1 project player' }))
    ).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.deleteCombinedPlayers).toHaveBeenCalledOnce());

    expect(element.querySelector('[data-ui-selection-footer]')?.textContent).toContain(
      '1 player selected',
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      'Combined players could not be deleted.',
      'Dismiss',
      { duration: 6000 },
    );
  });

  it('clamps pagination after deleting the last combined player on a page', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage('players', [player()], 26);
    const paginator = await loader.getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    await fixture.whenStable();
    const checkboxes = await loader.getAllHarnesses(MatCheckboxHarness);
    await checkboxes[1].check();
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-bulk-delete-button]' }))
    ).click();
    await (
      await documentLoader.getHarness(MatButtonHarness.with({ text: 'Delete 1 project player' }))
    ).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(3));

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 0 }),
    );
  });

  it('restores saved combined filters when no explicit parent filter is linked', async () => {
    window.localStorage.setItem(
      combinedEntityFilterPreferenceKey('project-id', 'players'),
      JSON.stringify({
        version: 1,
        filters: {
          ...emptyCombinedEntityFilters(),
          sourceNames: ['soccerway'],
          statuses: ['needsReview'],
          customBadgeIds: ['combined-badge-review'],
          parentIds: ['team-2'],
          nationalities: ['Senegal'],
          positions: ['ATTACKER'],
          positionDetails: ['ST'],
          feet: ['RIGHT'],
        },
      }),
    );

    const { api, loader, router } = await renderPage('players', [player()]);

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceNames: ['soccerway'],
        teamIds: ['team-2'],
        nationalities: ['Senegal'],
        positions: ['ATTACKER'],
        positionDetails: ['ST'],
        feet: ['RIGHT'],
        needsReview: true,
        customBadgeIds: ['combined-badge-review'],
      }),
    );
    expect(router.url).toBe('/projects/project-id/combined/players?teamId=team-2');
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 7 active',
    );
  });

  it('uses an explicit parent link instead of saved combined filters', async () => {
    window.localStorage.setItem(
      combinedEntityFilterPreferenceKey('project-id', 'teams'),
      JSON.stringify({
        version: 1,
        filters: {
          ...emptyCombinedEntityFilters(),
          sourceNames: ['soccerway'],
          parentIds: ['league-1'],
          countries: ['England'],
        },
      }),
    );

    const { api } = await renderPage('teams', [team()], 1, undefined, undefined, {
      leagueId: 'league-2',
    });

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leagueIds: ['league-2'],
        sourceNames: [],
      }),
    );
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('countries');
    expect(
      JSON.parse(
        window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-id', 'teams')) ??
          '{}',
      ),
    ).toMatchObject({
      filters: {
        sourceNames: [],
        parentIds: ['league-2'],
        countries: [],
      },
    });
  });

  it('removes stale saved combined options after current options load', async () => {
    window.localStorage.setItem(
      combinedEntityFilterPreferenceKey('project-id', 'players'),
      JSON.stringify({
        version: 1,
        filters: {
          ...emptyCombinedEntityFilters(),
          sourceNames: ['transfermarkt'],
          customBadgeIds: ['missing-badge'],
          parentIds: ['missing-team'],
          nationalities: ['Missing nationality'],
          positions: ['MIDFIELDER'],
          positionDetails: ['CM'],
          feet: ['LEFT'],
        },
      }),
    );

    const { api } = await renderPage('players', [player()]);

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceNames: ['transfermarkt'] }),
    );
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('teamIds');
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('customBadgeIds');
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('nationalities');
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('positions');
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('positionDetails');
    expect(
      JSON.parse(
        window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-id', 'players')) ??
          '{}',
      ),
    ).toMatchObject({
      filters: {
        sourceNames: ['transfermarkt'],
        customBadgeIds: [],
        parentIds: [],
        nationalities: [],
        positions: [],
        positionDetails: [],
      },
    });
  });

  it('stages combined filters in a right drawer and applies them with search', async () => {
    const { api, documentLoader, element, fixture, loader } = await renderPage(
      'players',
      [player()],
      12_345,
    );
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    const filterButtonElement = element.querySelector<HTMLButtonElement>('[data-ui-filter-button]');

    expect(await filterButton.getAppearance()).toBe('tonal');
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe('Open filters');
    expect(element.querySelector('[data-ui-record-count]')?.textContent).toContain(
      '12,345 records',
    );
    expect(element.textContent).not.toContain('Linked providers');

    const paginator = await loader.getHarness(MatPaginatorHarness);
    await paginator.goToNextPage();
    await fixture.whenStable();
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
    );
    const callsBeforeOpen = api.listCombinedEntities.mock.calls.length;

    filterButtonElement?.focus();
    await filterButton.click();
    await fixture.whenStable();
    const drawer = await documentLoader.getHarness(MatDialogHarness);
    expect(await drawer.getRole()).toBe('dialog');
    expect(await drawer.getAriaLabelledby()).toBe('combined-entity-filter-title');
    const panel = document.querySelector<HTMLElement>('.entity-filter-drawer-panel');
    expect(panel?.style.height).toBe('100vh');
    expect(panel?.parentElement?.style.justifyContent).toBe('flex-end');
    expect(panel?.contains(document.activeElement)).toBe(true);

    const providers = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by linked providers"]',
      }),
    );
    await providers.open();
    await providers.clickOptions({ text: /Transfermarkt|Soccerway/ });
    const statuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by badges"]',
      }),
    );
    await statuses.open();
    await statuses.clickOptions({ text: 'Needs review' });
    await statuses.clickOptions({ text: 'Manual review' });
    expect(api.listCombinedEntities).toHaveBeenCalledTimes(callsBeforeOpen);

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.listCombinedEntities).toHaveBeenCalledTimes(callsBeforeOpen + 1),
    );
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageIndex: 0,
        sourceNames: ['transfermarkt', 'soccerway'],
        needsReview: true,
        customBadgeIds: ['combined-badge-review'],
      }),
    );
    expect(document.activeElement).toBe(filterButtonElement);
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 2 active',
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-id', 'players')) ??
          '{}',
      ),
    ).toMatchObject({
      filters: {
        sourceNames: ['transfermarkt', 'soccerway'],
        statuses: ['needsReview'],
        customBadgeIds: ['combined-badge-review'],
      },
    });

    const search = element.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Combined entity search input was not created.');
    search.value = 'Adam';
    search.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(api.listCombinedEntities).toHaveBeenCalledTimes(callsBeforeOpen + 2),
    );
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'Adam',
        sourceNames: ['transfermarkt', 'soccerway'],
        needsReview: true,
        customBadgeIds: ['combined-badge-review'],
      }),
    );
  });

  it('maps Ready to false and both selected statuses to no request restriction', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage('players', [player()]);
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();

    const statuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by badges"]',
      }),
    );
    await statuses.open();
    await statuses.clickOptions({ text: 'Ready' });
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(2));
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({ needsReview: false }),
    );
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 1 active',
    );

    await filterButton.click();
    const restoredStatuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by badges"]',
      }),
    );
    await restoredStatuses.open();
    await restoredStatuses.clickOptions({ text: 'Needs review' });
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(3));
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('needsReview');
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 1 active',
    );

    await filterButton.click();
    const selectedStatuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by badges"]',
      }),
    );
    await selectedStatuses.open();
    expect(
      await Promise.all(
        (await selectedStatuses.getOptions()).map(async (option) => ({
          selected: await option.isSelected(),
          text: await option.getText(),
        })),
      ),
    ).toEqual([
      { selected: true, text: 'Ready' },
      { selected: true, text: 'Needs review' },
      { selected: false, text: 'Manual review' },
    ]);
    await selectedStatuses.close();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
  });

  it('applies every player-specific canonical filter as one staged request', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage('players', [player()]);
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();

    const teamAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter project players by project teams"]',
      }),
    );
    await teamAutocomplete.enterText('ars');
    await teamAutocomplete.selectOption({ text: 'Arsenal' });
    const teamGrid = await documentLoader.getHarness(
      MatChipGridHarness.with({ selector: '[data-ui-parent-chip-grid]' }),
    );
    expect(await Promise.all((await teamGrid.getRows()).map((row) => row.getText()))).toEqual([
      'Arsenal',
    ]);

    const nationalityAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter project players by nationalities"]',
      }),
    );
    await nationalityAutocomplete.enterText('sen');
    await nationalityAutocomplete.selectOption({ text: 'Senegal' });

    const positions = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by positions"]',
      }),
    );
    await positions.open();
    await positions.clickOptions({ text: 'ATT' });
    const positionDetails = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by position details"]',
      }),
    );
    await positionDetails.open();
    await positionDetails.clickOptions({ text: 'ST' });
    const feet = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by preferred foot"]',
      }),
    );
    await feet.open();
    await feet.clickOptions({ text: 'Right' });

    expect(api.listCombinedEntities).toHaveBeenCalledOnce();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(2));

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageIndex: 0,
        teamIds: ['team-2'],
        nationalities: ['Senegal'],
        positions: ['ATTACKER'],
        positionDetails: ['ST'],
        feet: ['RIGHT'],
      }),
    );
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 5 active',
    );
  });

  it('applies league country, tier, and missing-tier filters without offering seasons', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage('leagues', [league()]);
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();

    const countryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter project leagues by countries"]',
      }),
    );
    await countryAutocomplete.enterText('eng');
    await countryAutocomplete.selectOption({ text: 'England' });
    const tiers = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project leagues by tiers"]',
      }),
    );
    await tiers.open();
    await tiers.clickOptions({ text: /Tier 1|Tier 2/ });
    await (
      await documentLoader.getHarness(
        MatCheckboxHarness.with({ label: 'Include leagues without a tier' }),
      )
    ).check();
    expect(
      await documentLoader.getAllHarnesses(
        MatSelectHarness.with({
          selector: '[aria-label="Filter project leagues by seasons"]',
        }),
      ),
    ).toHaveLength(0);

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(2));

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        countries: ['England'],
        tiers: [1, 2],
        includeLeaguesWithoutTier: true,
      }),
    );
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('seasons');
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 2 active',
    );
  });

  it('applies project league, missing-league, and country filters without offering seasons', async () => {
    const { api, documentLoader, fixture, loader, router } = await renderPage('teams', [team()]);
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();
    await fixture.whenStable();

    const leagueAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter project teams by project leagues"]',
      }),
    );
    await leagueAutocomplete.enterText('czech');
    await leagueAutocomplete.selectOption({ text: 'Czech First League' });
    await (
      await documentLoader.getHarness(
        MatCheckboxHarness.with({ label: 'Include teams without a league' }),
      )
    ).check();
    const countryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter project teams by countries"]',
      }),
    );
    await countryAutocomplete.enterText('cze');
    await countryAutocomplete.selectOption({ text: 'Czechia' });
    expect(
      await documentLoader.getAllHarnesses(
        MatSelectHarness.with({
          selector: '[aria-label="Filter project teams by seasons"]',
        }),
      ),
    ).toHaveLength(0);

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(2));

    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leagueIds: ['league-2'],
        includeTeamsWithoutLeague: true,
        countries: ['Czechia'],
      }),
    );
    expect(router.url).toBe('/projects/project-id/combined/teams?leagueId=league-2');
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('seasons');
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 2 active',
    );
  });

  it('clears a parent filter from the URL when the drawer clears it', async () => {
    const { api, documentLoader, fixture, loader, router } = await renderPage(
      'teams',
      [team()],
      1,
      undefined,
      undefined,
      { leagueId: 'league-1' },
    );
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
    ).click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Clear all' }))).click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();

    await vi.waitFor(() => expect(router.url).toBe('/projects/project-id/combined/teams'));
    expect(api.listCombinedEntities.mock.calls.at(-1)?.[0]).not.toHaveProperty('leagueIds');
  });

  it('keeps provider and status filters usable when canonical options fail', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage(
      'players',
      [player()],
      1,
      undefined,
      'Options unavailable',
    );
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();

    const dialog = await documentLoader.getHarness(MatDialogHarness);
    expect(await dialog.getText()).toContain(
      'Additional filters could not be loaded: Options unavailable',
    );
    const providers = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by linked providers"]',
      }),
    );
    expect(await providers.isDisabled()).toBe(false);
    await providers.open();
    await providers.clickOptions({ text: 'Transfermarkt' });
    const statuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project players by badges"]',
      }),
    );
    expect(await statuses.isDisabled()).toBe(false);
    await statuses.open();
    await statuses.clickOptions({ text: 'Needs review' });
    const teamAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({
        selector: 'input[aria-label="Filter project players by project teams"]',
      }),
    );
    expect(await teamAutocomplete.isDisabled()).toBe(true);

    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Retry' }))).click();
    await fixture.whenStable();
    expect(api.listCombinedEntityFilterOptions).toHaveBeenCalledTimes(2);
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(2));
    expect(api.listCombinedEntities).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceNames: ['transfermarkt'],
        needsReview: true,
      }),
    );
  });

  it('discards cancelled filter edits and applies Clear all once confirmed', async () => {
    const { api, documentLoader, fixture, loader } = await renderPage('teams', [team()]);
    const filterButton = await loader.getHarness(
      MatButtonHarness.with({ selector: '[data-ui-filter-button]' }),
    );
    await filterButton.click();
    const providers = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project teams by linked providers"]',
      }),
    );
    await providers.open();
    await providers.clickOptions({ text: 'Transfermarkt' });
    const statuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project teams by badges"]',
      }),
    );
    await statuses.open();
    await statuses.clickOptions({ text: 'Needs review' });
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(document.querySelector('.entity-filter-drawer-panel')).toBeNull(),
    );

    await filterButton.click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Clear all' }))).click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Cancel' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(document.querySelector('.entity-filter-drawer-panel')).toBeNull(),
    );
    expect(api.listCombinedEntities).toHaveBeenCalledTimes(2);
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe(
      'Open filters, 2 active',
    );

    await filterButton.click();
    await fixture.whenStable();
    const restoredProviders = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project teams by linked providers"]',
      }),
    );
    await restoredProviders.open();
    const restoredProviderOptions = await restoredProviders.getOptions();
    expect(
      await Promise.all(
        restoredProviderOptions.map(async (option) => ({
          selected: await option.isSelected(),
          text: await option.getText(),
        })),
      ),
    ).toContainEqual({ selected: true, text: 'Transfermarkt' });
    await restoredProviders.close();
    const restoredStatuses = await documentLoader.getHarness(
      MatSelectHarness.with({
        selector: '[aria-label="Filter project teams by badges"]',
      }),
    );
    await restoredStatuses.open();
    expect(
      await Promise.all(
        (await restoredStatuses.getOptions()).map(async (option) => ({
          selected: await option.isSelected(),
          text: await option.getText(),
        })),
      ),
    ).toContainEqual({ selected: true, text: 'Needs review' });
    await restoredStatuses.close();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Clear all' }))).click();
    await (await documentLoader.getHarness(MatButtonHarness.with({ text: 'Apply' }))).click();
    await fixture.whenStable();
    await vi.waitFor(() => expect(api.listCombinedEntities).toHaveBeenCalledTimes(3));

    const request = api.listCombinedEntities.mock.calls.at(-1)?.[0];
    expect(request).toMatchObject({ pageIndex: 0, sourceNames: [] });
    expect(request).not.toHaveProperty('needsReview');
    expect(await (await filterButton.host()).getAttribute('aria-label')).toBe('Open filters');
    expect(
      window.localStorage.getItem(combinedEntityFilterPreferenceKey('project-id', 'teams')),
    ).toBeNull();
  });

  it('has no detectable AXE violations with the combined filter drawer open', async () => {
    const { fixture, loader } = await renderPage('leagues', [league()]);
    await (
      await loader.getHarness(MatButtonHarness.with({ selector: '[data-ui-filter-button]' }))
    ).click();
    await fixture.whenStable();

    const overlay = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (!overlay) throw new Error('Combined filter drawer overlay was not created.');
    expect((await axe.run(overlay)).violations).toEqual([]);
  });
});
