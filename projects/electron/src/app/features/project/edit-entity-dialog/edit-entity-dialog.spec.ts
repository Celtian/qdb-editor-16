import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSelectHarness } from '@angular/material/select/testing';

import axe from 'axe-core';

import type { League, Team } from '../../../../../shared/downloader/contracts';
import { EditEntityDialog, type EditEntityDialogData } from './edit-entity-dialog';

const league = (id: string, name: string): League => ({
  id,
  projectId: 'project-id',
  sourceName: 'transfermarkt',
  sourceId: id,
  name,
  sourceUrl: `https://example.test/${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const expectSourceExample = (
  element: HTMLElement,
  index: number,
  label: string,
  url: string,
): void => {
  const link = [...element.querySelectorAll<HTMLAnchorElement>('[data-ui-source-example]')].at(
    index,
  );
  if (!link) throw new Error(`Source example ${index} did not render.`);

  expect(link.textContent).toContain(label);
  expect(link.textContent).toContain(url);
  expect(link.getAttribute('href')).toBe(url);
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
  expect(link.getAttribute('aria-label')).toBe(`Open example ${label} URL in the system browser`);
};

const expectSelectedCountryFlag = (element: HTMLElement, code?: string): void => {
  const flag = element.querySelector<HTMLImageElement>('[data-ui-selected-country-flag] img');
  if (!code) {
    expect(flag).toBeNull();
    return;
  }

  expect(flag?.getAttribute('src')).toBe(`flags/20x15/${code}.png`);
  expect(flag?.getAttribute('alt')).toBe('');
};

describe('EditEntityDialog', () => {
  it('autocompletes and validates an optional football country for leagues', async () => {
    const close = vi.fn();
    const premierLeague: League = {
      ...league('GB1', 'Premier League'),
      tier: 2,
      countryName: 'England',
      countryCode2: 'GB',
      countryCode3: 'ENG',
    };
    await TestBed.configureTestingModule({
      imports: [EditEntityDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            entity: premierLeague,
            kind: 'leagues',
            leagues: [],
          } satisfies EditEntityDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditEntityDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const documentLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    const tierSelect = await documentLoader.getHarness(
      MatSelectHarness.with({ selector: 'mat-select[aria-label="League tier"]' }),
    );
    const form = element.querySelector('form');
    if (!form) throw new Error('League metadata form did not render.');

    expect(await autocomplete.getValue()).toBe('England');
    expectSelectedCountryFlag(element, 'gb-eng');
    expect(
      [...element.querySelectorAll('mat-form-field mat-label')]
        .slice(0, 5)
        .map((label) => label.textContent.trim()),
    ).toEqual(['Name', 'Country', 'Tier', 'Provider', 'Transfermarkt source ID']);
    expect(await tierSelect.getValueText()).toBe('Tier 2');
    await tierSelect.open();
    await tierSelect.clickOptions({ text: 'Tier 3' });

    await autocomplete.enterText('Atlantis');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Select a country from the list or leave it empty.');
    expectSelectedCountryFlag(element);

    await autocomplete.clear();
    await autocomplete.enterText('sco');
    expectSelectedCountryFlag(element);
    expect(await autocomplete.getOptions({ text: 'Scotland' })).toHaveLength(1);
    await autocomplete.selectOption({ text: 'Scotland' });
    expectSelectedCountryFlag(element, 'gb-sct');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Premier League', countryCode3: 'SCO', tier: 3 }),
    );
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('validates identity fields and returns an updated team relationship', async () => {
    const currentLeague = league('GB1', 'Premier League');
    const nextLeague = league('GB2', 'Championship');
    const otherSourceLeague: League = {
      ...league('chance-liga', 'Chance Liga'),
      sourceName: 'soccerway',
    };
    const team: Team = {
      id: '281',
      projectId: 'project-id',
      leagueId: currentLeague.id,
      sourceName: 'transfermarkt',
      sourceId: '281',
      name: 'Manchester City',
      countryName: 'Czech Republic',
      countryCode2: 'CZ',
      countryCode3: 'CZE',
      sourceUrl: 'https://example.test/281',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const close = vi.fn();
    const data: EditEntityDialogData = {
      entity: team,
      kind: 'teams',
      leagues: [currentLeague, otherSourceLeague, nextLeague],
    };
    await TestBed.configureTestingModule({
      imports: [EditEntityDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditEntityDialog);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const element = fixture.nativeElement as HTMLElement;
    const inputs = [...element.querySelectorAll<HTMLInputElement>('input')];
    const form = element.querySelector('form');
    const seasonInput = inputs[4];
    const documentLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const countryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    const leagueSelect = await loader.getHarness(
      MatSelectHarness.with({ selector: '[data-ui-league-select]' }),
    );
    if (!form) throw new Error('Metadata form did not render.');

    expect(element.querySelector('select')).toBeNull();
    expect(await leagueSelect.getValueText()).toBe('Premier League');
    expect(await countryAutocomplete.getValue()).toBe('Czech Republic');
    expect(
      [...element.querySelectorAll('mat-form-field mat-label')]
        .slice(0, 5)
        .map((label) => label.textContent.trim()),
    ).toEqual(['Name', 'Country', 'League', 'Provider', 'Transfermarkt source ID']);
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['281', '2026']);
    expect(element.querySelector('[data-ui-source-note] h3')?.textContent).toBe(
      'How Soccerbot builds source links',
    );
    expect(element.querySelectorAll('[data-ui-source-example]')).toHaveLength(1);
    expectSourceExample(
      element,
      0,
      'Team page',
      'https://www.transfermarkt.com/slug/kader/verein/281/plus/1',
    );
    expect(element.querySelector('[data-ui-source-note-detail]')?.textContent).toContain(
      'Season 2026 adds ?saison_id=2026.',
    );
    expect((await axe.run(element)).violations).toEqual([]);

    seasonInput.value = '20';
    seasonInput.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use a four-digit season or leave it empty.');

    seasonInput.value = '2026';
    seasonInput.dispatchEvent(new Event('input', { bubbles: true }));
    await countryAutocomplete.clear();
    await countryAutocomplete.enterText('svk');
    await countryAutocomplete.selectOption({ text: 'Slovakia' });
    await leagueSelect.open();
    expect(
      await Promise.all((await leagueSelect.getOptions()).map((option) => option.getText())),
    ).toEqual(['No league', 'Premier League', 'Championship']);
    await leagueSelect.clickOptions({ text: 'Championship' });
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Manchester City',
        countryCode3: 'SVK',
        season: '2026',
        leagueId: nextLeague.id,
      }),
    );
  });

  it('treats an existing cross-source league assignment as unassigned', async () => {
    const sameSourceLeague = league('GB1', 'Premier League');
    const otherSourceLeague: League = {
      ...league('chance-liga', 'Chance Liga'),
      sourceName: 'soccerway',
    };
    const team: Team = {
      id: '281',
      projectId: 'project-id',
      leagueId: otherSourceLeague.id,
      sourceName: 'transfermarkt',
      sourceId: '281',
      name: 'Manchester City',
      countryName: 'England',
      countryCode2: 'GB',
      countryCode3: 'ENG',
      sourceUrl: 'https://example.test/281',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [EditEntityDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            entity: team,
            kind: 'teams',
            leagues: [otherSourceLeague, sameSourceLeague],
          } satisfies EditEntityDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditEntityDialog);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const documentLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
    const countryAutocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '[data-ui-country-input]' }),
    );
    const leagueSelect = await loader.getHarness(
      MatSelectHarness.with({ selector: '[data-ui-league-select]' }),
    );
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement | null;
    if (!form) throw new Error('Metadata form did not render.');

    expect(await leagueSelect.getValueText()).toBe('No league');
    await leagueSelect.open();
    expect(
      await Promise.all((await leagueSelect.getOptions()).map((option) => option.getText())),
    ).toEqual(['No league', 'Premier League']);
    await leagueSelect.close();
    await countryAutocomplete.clear();

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ countryCode3: '', leagueId: '' }));
  });

  it('locks Soccerway, hides its season, validates path IDs, and explains regenerated URLs', async () => {
    const close = vi.fn();
    const team: Team = {
      id: 'team-id',
      projectId: 'project-id',
      sourceName: 'soccerway',
      sourceId: 'slavia-prague/viXGgnyB',
      name: 'Slavia Prague',
      sourceUrl: 'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await TestBed.configureTestingModule({
      imports: [EditEntityDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { entity: team, kind: 'teams', leagues: [] } satisfies EditEntityDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditEntityDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const inputs = [...element.querySelectorAll<HTMLInputElement>('input')];
    const provider = inputs[2];
    const sourceId = inputs[3];
    const form = element.querySelector('form');
    if (!form) throw new Error('Soccerway metadata form did not render.');

    expect(provider.readOnly).toBe(true);
    expect(provider.value).toBe('Soccerway');
    expect(element.textContent).not.toContain('Season');
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['slavia-prague/viXGgnyB']);
    expect(element.querySelectorAll('[data-ui-source-example]')).toHaveLength(2);
    expectSourceExample(
      element,
      0,
      'Team page',
      'https://www.soccerway.com/team/slavia-prague/viXGgnyB/squad/',
    );
    expectSourceExample(
      element,
      1,
      'Player page',
      'https://www.soccerway.com/player/kolar-ondrej/xfBGcS1U/',
    );

    sourceId.value = '281';
    sourceId.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use the Soccerway path shown in the example.');

    sourceId.value = 'sparta-prague/hM8p0S1x';
    sourceId.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'sparta-prague/hM8p0S1x',
        season: '',
      }),
    );
  });

  it('locks WorldFootball, hides its season, and validates canonical path IDs', async () => {
    const close = vi.fn();
    const team: Team = {
      id: 'team-id',
      projectId: 'project-id',
      sourceName: 'worldfootball',
      sourceId: 'te237557/artesanos-metepec',
      name: 'Artesanos Metepec',
      sourceUrl: 'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await TestBed.configureTestingModule({
      imports: [EditEntityDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { entity: team, kind: 'teams', leagues: [] } satisfies EditEntityDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditEntityDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const inputs = [...element.querySelectorAll<HTMLInputElement>('input')];
    const provider = inputs[2];
    const sourceId = inputs[3];
    const form = element.querySelector('form');
    if (!form) throw new Error('WorldFootball metadata form did not render.');

    expect(provider.value).toBe('WorldFootball');
    expect(element.textContent).not.toContain('Season');
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['te237557/artesanos-metepec']);
    expect(element.querySelectorAll('[data-ui-source-example]')).toHaveLength(2);
    expectSourceExample(
      element,
      0,
      'Team page',
      'https://www.worldfootball.net/teams/te237557/artesanos-metepec/squad/',
    );
    expectSourceExample(
      element,
      1,
      'Player page',
      'https://www.worldfootball.net/person/pe599828/oscar-altamirano/',
    );

    sourceId.value = 'co7093/mexico-lp---serie-b';
    sourceId.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use the WorldFootball path shown in the example.');

    sourceId.value = 'te162876/sporting-caneramy';
    sourceId.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'te162876/sporting-caneramy', season: '' }),
    );
  });

  it('locks Eurofotbal, hides its season, and validates canonical path IDs', async () => {
    const close = vi.fn();
    const team: Team = {
      id: 'team-id',
      projectId: 'project-id',
      sourceName: 'eurofotbal',
      sourceId: 'cesko/sparta-praha',
      name: 'Sparta Praha',
      sourceUrl: 'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await TestBed.configureTestingModule({
      imports: [EditEntityDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { entity: team, kind: 'teams', leagues: [] } satisfies EditEntityDialogData,
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EditEntityDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const inputs = [...element.querySelectorAll<HTMLInputElement>('input')];
    const provider = inputs[2];
    const sourceId = inputs[3];
    const form = element.querySelector('form');
    if (!form) throw new Error('Eurofotbal metadata form did not render.');

    expect(provider.value).toBe('Eurofotbal');
    expect(element.textContent).not.toContain('Season');
    expect(
      [...element.querySelectorAll('mat-hint strong')].map((example) => example.textContent),
    ).toEqual(['cesko/sparta-praha']);
    expect(element.querySelectorAll('[data-ui-source-example]')).toHaveLength(1);
    expectSourceExample(
      element,
      0,
      'Team page',
      'https://www.eurofotbal.cz/kluby/cesko/sparta-praha/soupiska',
    );
    expect(element.textContent).toContain('Eurofotbal player source pages are not available.');

    sourceId.value = 'sparta-praha';
    sourceId.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Use the Eurofotbal path shown in the example.');

    sourceId.value = 'cesko/slavia-praha';
    sourceId.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'cesko/slavia-praha', season: '' }),
    );
    expect((await axe.run(element)).violations).toEqual([]);
  });
});
