import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import axe from 'axe-core';

import { PageHeader } from './page-header';

@Component({
  selector: 'app-page-header-test-host',
  imports: [PageHeader],
  template: `
    <app-page-header icon="flag">
      <div pageHeaderContent>
        <h1>Countries</h1>
        <p>Domain-oriented FIFA 16 objects.</p>
      </div>
      <button pageHeaderTitleAction type="button">Title action</button>
      @if (showActions()) {
        <button pageHeaderActions type="button">Create country</button>
      }
    </app-page-header>
  `,
})
class PageHeaderTestHost {
  readonly showActions = signal(true);
}

describe('PageHeader', () => {
  it('renders the canonical icon, content, title action, and page actions accessibly', async () => {
    await TestBed.configureTestingModule({ imports: [PageHeaderTestHost] }).compileComponents();
    const fixture = TestBed.createComponent(PageHeaderTestHost);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.qdb-page-header-icon mat-icon')?.textContent?.trim()).toBe(
      'flag',
    );
    expect(element.querySelector('[pageHeaderContent] h1')?.textContent).toContain('Countries');
    expect(element.querySelector('[pageHeaderContent] p')?.textContent).toContain(
      'Domain-oriented FIFA 16 objects.',
    );
    expect(element.querySelector('.qdb-page-header-title-action button')?.textContent).toContain(
      'Title action',
    );
    expect(element.querySelector('.qdb-page-header-actions button')?.textContent).toContain(
      'Create country',
    );
    expect(element.querySelector('.page-header--details')).toBeNull();
    expect((await axe.run(element)).violations).toEqual([]);
  });

  it('hides the action container when no page actions are projected', async () => {
    await TestBed.configureTestingModule({ imports: [PageHeaderTestHost] }).compileComponents();
    const fixture = TestBed.createComponent(PageHeaderTestHost);
    fixture.componentInstance.showActions.set(false);
    await fixture.whenStable();
    const actions = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.qdb-page-header-actions',
    );

    expect(actions?.childElementCount).toBe(0);
    expect(actions ? getComputedStyle(actions).display : undefined).toBe('none');
  });
});
