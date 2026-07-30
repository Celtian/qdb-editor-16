import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-page-header',
  imports: [MatIconModule],
  template: `
    <header class="page-header">
      <div class="page-header__icon" aria-hidden="true">
        <mat-icon>{{ icon() }}</mat-icon>
      </div>
      <div class="page-header__content">
        <ng-content select="[pageHeaderContent]" />
      </div>
      <div class="page-header__actions">
        <ng-content select="[pageHeaderActions]" />
      </div>
    </header>
  `,
  styleUrl: './page-header.css',
})
export class PageHeader {
  readonly icon = input.required<string>();
}
