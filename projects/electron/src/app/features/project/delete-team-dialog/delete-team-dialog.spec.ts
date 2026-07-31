import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import axe from 'axe-core';
import { DeleteTeamDialog } from './delete-team-dialog';

describe('DeleteTeamDialog', () => {
  it.each([
    { playerCount: 1, countText: '1 player' },
    { playerCount: 28, countText: '28 players' },
  ])(
    'names the team, describes deletion of $countText, and keeps the safe action first',
    async ({ playerCount, countText }) => {
      await TestBed.configureTestingModule({
        imports: [DeleteTeamDialog],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: { name: 'Bohemians Praha 1905', playerCount },
          },
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(DeleteTeamDialog);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      const buttons =
        await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatButtonHarness);

      expect(element.textContent).toContain('Delete team?');
      expect(element.textContent).toContain('Bohemians Praha 1905');
      expect(element.textContent).toContain(countText);
      expect(element.textContent).toContain('This action cannot be undone.');
      expect(await Promise.all(buttons.map((button) => button.getText()))).toEqual([
        'Cancel',
        'Delete team',
      ]);
      expect((await axe.run(element)).violations).toEqual([]);
    },
  );

  it('describes bulk team and player deletion with the safe action first', async () => {
    await TestBed.configureTestingModule({
      imports: [DeleteTeamDialog],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { bulk: true, teamCount: 2, playerCount: 57 },
        },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeleteTeamDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const buttons =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatButtonHarness);

    expect(element.textContent).toContain('Delete selected teams?');
    expect(element.textContent).toContain('2 teams selected');
    expect(element.textContent).toContain('57 players');
    expect(await Promise.all(buttons.map((button) => button.getText()))).toEqual([
      'Cancel',
      'Delete 2 teams',
    ]);
    expect((await axe.run(element)).violations).toEqual([]);
  });
});
