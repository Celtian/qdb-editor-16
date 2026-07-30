import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute } from '@angular/router';
import type { DocumentationPage } from './documentation';

@Component({
  selector: 'app-documentation-page',
  imports: [MatCardModule],
  template: `
    <article>
      <header class="hero">
        <p class="eyebrow">QDB Editor 16 documentation</p>
        <h1>{{ page.title }}</h1>
        <p class="summary">{{ page.summary }}</p>
      </header>
      @for (section of page.sections; track section.title) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>{{ section.title }}</h2>
            @for (paragraph of section.paragraphs; track paragraph) {
              <p>{{ paragraph }}</p>
            }
            @if (section.bullets) {
              <ul>
                @for (bullet of section.bullets; track bullet) {
                  <li>{{ bullet }}</li>
                }
              </ul>
            }
          </mat-card-content>
        </mat-card>
      }
    </article>
  `,
  styles: `
    article {
      display: grid;
      gap: 1.25rem;
      width: min(100%, 56rem);
      margin: 0 auto;
      padding: 3rem 2rem;
    }
    .hero {
      padding-bottom: 1rem;
    }
    .eyebrow {
      color: var(--mat-sys-primary);
      font-weight: 600;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 6vw, 4rem);
      line-height: 1.05;
    }
    .summary {
      max-width: 46rem;
      color: var(--mat-sys-on-surface-variant);
      font-size: 1.2rem;
      line-height: 1.6;
    }
    mat-card-content {
      padding-top: 1.5rem;
      line-height: 1.7;
    }
    @media (width <= 700px) {
      article {
        padding: 2rem 1rem;
      }
    }
  `,
})
export class DocumentationPageComponent {
  protected readonly page = inject(ActivatedRoute).snapshot.data['page'] as DocumentationPage;
}
