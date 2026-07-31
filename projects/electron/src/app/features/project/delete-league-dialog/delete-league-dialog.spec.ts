import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
import axe from 'axe-core';
import { DeleteLeagueDialog } from './delete-league-dialog';

describe('DeleteLeagueDialog', () => {
  it('describes both scopes with exact pluralized counts and defaults to keeping descendants', async () => {
    const dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [DeleteLeagueDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { name: 'Premier League', teamCount: 20, playerCount: 501 },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeleteLeagueDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const radios = await loader.getAllHarnesses(MatRadioButtonHarness);
    const buttons = await loader.getAllHarnesses(MatButtonHarness);

    expect(element.textContent).toContain('Delete league?');
    expect(element.textContent).toContain('Premier League');
    expect(element.textContent).toContain('20 teams');
    expect(element.textContent).toContain('501 players');
    expect(await Promise.all(radios.map((radio) => radio.getLabelText()))).toEqual([
      expect.stringContaining('Delete league only'),
      expect.stringContaining('Delete league, teams and players'),
    ]);
    expect(await radios[0]?.isChecked()).toBe(true);
    expect(await radios[1]?.isChecked()).toBe(false);
    expect(await Promise.all(buttons.map((button) => button.getText()))).toEqual([
      'Cancel',
      'Delete league',
    ]);
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Delete league' }))).click();
    expect(dialogRef.close).toHaveBeenCalledWith('league-only');
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('supports focus and selection of the cascading option and singular counts', async () => {
    const dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [DeleteLeagueDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { name: 'Single League', teamCount: 1, playerCount: 1 },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeleteLeagueDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const radios = await loader.getAllHarnesses(MatRadioButtonHarness);

    expect(element.textContent).toContain('1 team');
    expect(element.textContent).toContain('1 player');
    await radios[0]?.focus();
    expect(await radios[0]?.isFocused()).toBe(true);
    await radios[1]?.check();
    await fixture.whenStable();
    expect(await radios[1]?.isChecked()).toBe(true);

    await (await loader.getHarness(MatButtonHarness.with({ text: 'Delete league' }))).click();
    expect(dialogRef.close).toHaveBeenCalledWith('league-and-teams');
  });

  it('describes an aggregated bulk deletion with plural actions', async () => {
    const dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [DeleteLeagueDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { bulk: true, leagueCount: 2, teamCount: 36, playerCount: 800 },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeleteLeagueDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);

    expect(element.textContent).toContain('Delete selected leagues?');
    expect(element.textContent).toContain('2 selected leagues');
    expect(element.textContent).toContain('36 teams');
    expect(element.textContent).toContain('800 players');
    expect(
      await (
        await loader.getHarness(
          MatRadioButtonHarness.with({ label: /Delete selected leagues only/ }),
        )
      ).isChecked(),
    ).toBe(true);
    await (
      await loader.getHarness(
        MatRadioButtonHarness.with({
          label: /Delete selected leagues, teams and players/,
        }),
      )
    ).check();
    await (await loader.getHarness(MatButtonHarness.with({ text: 'Delete 2 leagues' }))).click();

    expect(dialogRef.close).toHaveBeenCalledWith('league-and-teams');
    expect((await axe.run(element)).violations).toEqual([]);
  });
});
