import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import axe from 'axe-core';
import {
  ChangeLeagueTierDialog,
  type ChangeLeagueTierDialogData,
} from './change-league-tier-dialog';

const createDialog = async (data: ChangeLeagueTierDialogData) => {
  const close = vi.fn();
  await TestBed.configureTestingModule({
    imports: [ChangeLeagueTierDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ChangeLeagueTierDialog);
  await fixture.whenStable();
  return {
    close,
    element: fixture.nativeElement as HTMLElement,
    fixture,
    loader: TestbedHarnessEnvironment.loader(fixture),
  };
};

describe('ChangeLeagueTierDialog', () => {
  it('prefills and applies a common tier to selected leagues', async () => {
    const { close, element, loader } = await createDialog({
      leagueCount: 2,
      tier: 3,
      mixedTiers: false,
    });
    const tierSelect = await loader.getHarness(MatSelectHarness);

    expect(element.textContent).toContain('Apply one tier to 2 leagues.');
    expect(await tierSelect.getValueText()).toBe('Tier 3');
    await tierSelect.open();
    await tierSelect.clickOptions({ text: 'Tier 7' });
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Apply tier' }))).click();

    expect(close).toHaveBeenCalledWith(7);
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('describes mixed values and clears the selected leagues', async () => {
    const { close, element, loader } = await createDialog({
      leagueCount: 3,
      mixedTiers: true,
    });
    const tierSelect = await loader.getHarness(MatSelectHarness);

    expect(element.textContent).toContain('currently have different tiers');
    expect(await tierSelect.getValueText()).toBe('No tier');
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Clear tier' }))).click();

    expect(close).toHaveBeenCalledWith(0);
  });
});
