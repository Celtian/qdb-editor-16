import { Component, input } from '@angular/core';
import type { CustomBadge as CustomBadgeValue } from '../../../../shared/downloader/custom-badge';

@Component({
  selector: 'app-custom-badge',
  template: `
    <span
      class="custom-badge"
      [class]="'custom-badge custom-badge--' + badge().color"
      [title]="badge().description"
    >
      {{ badge().name }}
    </span>
  `,
  styleUrl: './custom-badge.css',
})
export class CustomBadge {
  readonly badge = input.required<CustomBadgeValue>();
}
