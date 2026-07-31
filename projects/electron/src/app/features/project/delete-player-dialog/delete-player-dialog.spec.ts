import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import axe from 'axe-core';
import { DeletePlayerDialog } from './delete-player-dialog';

describe('DeletePlayerDialog', () => {
  it('describes a single player deletion accessibly', async () => {
    await TestBed.configureTestingModule({
      imports: [DeletePlayerDialog],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { name: 'Ada Striker' } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(DeletePlayerDialog);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Delete player?');
    expect(element.textContent).toContain('Ada Striker');
    expect(element.textContent).toContain('This action cannot be undone.');
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('uses the selected player count for bulk deletion', async () => {
    await TestBed.configureTestingModule({
      imports: [DeletePlayerDialog],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: { bulk: true, playerCount: 3 } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(DeletePlayerDialog);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(text).toContain('Delete selected players?');
    expect(text).toContain('3 players selected');
    expect(text).toContain('Delete 3 players');
  });
});
