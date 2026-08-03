import { Component, input } from '@angular/core';

import type {
  CustomBadgeColor,
  CustomBadge as CustomBadgeValue,
} from '../../../../shared/downloader/custom-badge';

const badgeClasses: Record<CustomBadgeColor, string> = {
  red: 'inline-block whitespace-nowrap rounded-full bg-badge-red px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-red',
  orange:
    'inline-block whitespace-nowrap rounded-full bg-badge-orange px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-orange',
  yellow:
    'inline-block whitespace-nowrap rounded-full bg-badge-yellow px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-yellow',
  green:
    'inline-block whitespace-nowrap rounded-full bg-badge-green px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-green',
  teal: 'inline-block whitespace-nowrap rounded-full bg-badge-teal px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-teal',
  blue: 'inline-block whitespace-nowrap rounded-full bg-badge-blue px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-blue',
  purple:
    'inline-block whitespace-nowrap rounded-full bg-badge-purple px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-purple',
  pink: 'inline-block whitespace-nowrap rounded-full bg-badge-pink px-2.5 py-0 text-xs font-bold leading-6 text-on-badge-pink',
};

@Component({
  selector: 'app-custom-badge',
  template: `
    <span [class]="badgeClasses[badge().color]" [title]="badge().description">
      {{ badge().name }}
    </span>
  `,
  host: { class: 'inline-block' },
})
export class CustomBadge {
  readonly badge = input.required<CustomBadgeValue>();
  protected readonly badgeClasses = badgeClasses;
}
