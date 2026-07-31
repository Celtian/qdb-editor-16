import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import axe from 'axe-core';
import {
  ChangeLeagueCountryDialog,
  type ChangeLeagueCountryDialogData,
} from './change-league-country-dialog';

const createDialog = async (data: ChangeLeagueCountryDialogData) => {
  const close = vi.fn();
  await TestBed.configureTestingModule({
    imports: [ChangeLeagueCountryDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ChangeLeagueCountryDialog);
  await fixture.whenStable();
  return {
    close,
    documentLoader: TestbedHarnessEnvironment.documentRootLoader(fixture),
    element: fixture.nativeElement as HTMLElement,
    fixture,
    loader: TestbedHarnessEnvironment.loader(fixture),
  };
};

const expectSelectedCountryFlag = (element: HTMLElement, code?: string): void => {
  const flag = element.querySelector<HTMLImageElement>('.selected-country-flag img');
  if (!code) {
    expect(flag).toBeNull();
    return;
  }

  expect(flag?.getAttribute('src')).toBe(`flags/20x15/${code}.png`);
  expect(flag?.getAttribute('alt')).toBe('');
};

describe('ChangeLeagueCountryDialog', () => {
  it('prefills a common country and applies a canonical autocomplete selection', async () => {
    const { close, documentLoader, element, fixture, loader } = await createDialog({
      entity: 'leagues',
      entityCount: 2,
      countryCode3: 'CZE',
      mixedCountries: false,
    });
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '.country-input' }),
    );

    expect(await autocomplete.getValue()).toBe('Czech Republic');
    expectSelectedCountryFlag(element, 'cz');
    await autocomplete.clear();
    expectSelectedCountryFlag(element);
    await autocomplete.enterText('sco');
    expectSelectedCountryFlag(element);
    expect(await autocomplete.getOptions({ text: 'Scotland' })).toHaveLength(1);
    await autocomplete.selectOption({ text: 'Scotland' });
    expectSelectedCountryFlag(element, 'gb-sct');
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Apply country' }))).click();
    await fixture.whenStable();

    expect(close).toHaveBeenCalledWith('SCO');
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('shows mixed-country guidance and explicitly clears countries with an empty value', async () => {
    const { close, element, fixture, loader } = await createDialog({
      entity: 'leagues',
      entityCount: 3,
      mixedCountries: true,
    });

    expect(element.textContent).toContain('currently have different countries');
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Clear country' }))).click();
    await fixture.whenStable();

    expect(close).toHaveBeenCalledWith(null);
  });

  it('uses team-specific copy when changing selected team countries', async () => {
    const { element } = await createDialog({
      entity: 'teams',
      entityCount: 2,
      mixedCountries: true,
    });

    expect(element.textContent).toContain('Change country for selected teams');
    expect(element.textContent).toContain('Apply one country to 2 teams.');
    expect(element.textContent).toContain('The selected teams currently have different countries.');
    expect(element.textContent).toContain(
      'Leave empty to clear the country from every selected team.',
    );
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('rejects a typed value that is not a canonical football country', async () => {
    const { close, documentLoader, element, fixture } = await createDialog({
      entity: 'leagues',
      entityCount: 1,
      mixedCountries: false,
    });
    const autocomplete = await documentLoader.getHarness(
      MatAutocompleteHarness.with({ selector: '.country-input' }),
    );
    const form = element.querySelector('form');
    if (!form) throw new Error('Country form did not render.');

    await autocomplete.enterText('Not a country');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(close).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Select a country from the list or leave it empty.');
  });
});
