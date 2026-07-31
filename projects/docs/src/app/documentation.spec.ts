import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { DocumentationPageComponent } from './documentation-page';
import { documentationPages } from './documentation';

describe('documentation', () => {
  it('covers every primary desktop workflow and safety topic', () => {
    expect(documentationPages.map((page) => page.path)).toEqual(
      expect.arrayContaining([
        '',
        'installation',
        'projects',
        'source-db',
        'combined-db',
        'downloader-migration',
        'importing',
        'editing',
        'validation',
        'exporting',
        'storage',
        'troubleshooting',
        'releases',
      ]),
    );
  });

  it('renders a documentation page with accessible headings and list content', async () => {
    const page = documentationPages.find((candidate) => candidate.path === 'editing')!;
    TestBed.configureTestingModule({
      imports: [DocumentationPageComponent],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { data: { page } } } }],
    });
    const fixture = TestBed.createComponent(DocumentationPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain(page.title);
    expect(fixture.nativeElement.querySelectorAll('h2').length).toBe(page.sections.length);
    expect(fixture.nativeElement.querySelectorAll('li').length).toBeGreaterThan(0);
    expect((await axe.run(fixture.nativeElement as HTMLElement)).violations).toEqual([]);
  });
});
