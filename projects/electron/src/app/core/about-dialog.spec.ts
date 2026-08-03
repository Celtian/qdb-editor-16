import { ComponentFixture, TestBed } from '@angular/core/testing';

import axe from 'axe-core';

import { VERSION_INFO } from '../../../../version-info';
import { AboutDialog } from './about-dialog';

describe('AboutDialog', () => {
  let fixture: ComponentFixture<AboutDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(AboutDialog);
    await fixture.whenStable();
  });

  it('renders the product identity and generated application version', () => {
    const content = fixture.nativeElement as HTMLElement;
    const icon = content.querySelector<HTMLImageElement>('img');

    expect(icon?.getAttribute('ngSrc')).toBe('qdb-editor-16-icon.png');
    expect(icon?.alt).toBe('');
    expect(content.querySelector('h2')?.textContent).toContain('QDB Editor 16');
    expect(content.querySelector('[data-ui-version]')?.textContent).toContain(
      `Version ${VERSION_INFO.version}`,
    );
  });

  it('renders the product description and legal information', () => {
    const content = fixture.nativeElement as HTMLElement;
    const expectedYear = new Date(VERSION_INFO.date).getUTCFullYear();

    expect(content.querySelector('[data-ui-description]')?.textContent).toContain(
      'A local-first FIFA 16 database project and table editor',
    );
    expect(content.querySelector('[data-ui-legal]')?.textContent).toContain(
      `© ${expectedYear} ${VERSION_INFO.author.name} · MIT License`,
    );
  });

  it('links to the documentation and GitHub repository safely', () => {
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        '[data-ui-external-actions] a',
      ),
    );

    expect(
      links.map((link) => ({
        label: link.textContent?.trim(),
        href: link.getAttribute('href'),
        target: link.target,
        rel: link.rel,
      })),
    ).toEqual([
      {
        label: 'menu_bookDocumentation',
        href: 'https://celtian.github.io/qdb-editor-16/',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      {
        label: 'codeGitHub',
        href: 'https://github.com/Celtian/qdb-editor-16',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ]);
  });

  it('provides icon and text controls for closing the dialog', () => {
    const closeButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button[mat-dialog-close]',
      ),
    );

    expect(closeButtons).toHaveLength(2);
    expect(closeButtons[0]?.getAttribute('aria-label')).toBe('Close About dialog');
    expect(closeButtons[1]?.textContent?.trim()).toBe('Close');
  });

  it('has no automatically detectable accessibility violations', async () => {
    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  });
});
