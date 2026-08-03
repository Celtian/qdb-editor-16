import { Component, computed, input } from '@angular/core';

import type { PlayerPosition } from '../../../../shared/downloader/contracts';

export interface PositionBadgeDetails {
  abbreviation: string;
  className: string;
  label: string;
}

export const positionBadgeDetails: Record<PlayerPosition, PositionBadgeDetails> = {
  GOALKEEPER: {
    abbreviation: 'GK',
    className:
      'inline-block min-w-11 rounded-full bg-badge-goalkeeper px-2 py-0 text-center text-xs font-bold leading-6 tracking-badge text-on-badge-goalkeeper no-underline',
    label: 'Goalkeeper',
  },
  DEFENDER: {
    abbreviation: 'DEF',
    className:
      'inline-block min-w-11 rounded-full bg-badge-defender px-2 py-0 text-center text-xs font-bold leading-6 tracking-badge text-on-badge-defender no-underline',
    label: 'Defender',
  },
  MIDFIELDER: {
    abbreviation: 'MID',
    className:
      'inline-block min-w-11 rounded-full bg-badge-midfielder px-2 py-0 text-center text-xs font-bold leading-6 tracking-badge text-on-badge-midfielder no-underline',
    label: 'Midfielder',
  },
  ATTACKER: {
    abbreviation: 'ATT',
    className:
      'inline-block min-w-11 rounded-full bg-badge-attacker px-2 py-0 text-center text-xs font-bold leading-6 tracking-badge text-on-badge-attacker no-underline',
    label: 'Attacker',
  },
};

@Component({
  selector: 'app-position-badge',
  template: `
    <abbr
      [class]="details().className"
      [attr.aria-label]="details().label"
      [title]="details().label"
    >
      {{ details().abbreviation }}
    </abbr>
  `,
  host: { class: 'inline-block' },
})
export class PositionBadge {
  readonly position = input.required<PlayerPosition>();
  protected readonly details = computed(() => positionBadgeDetails[this.position()]);
}
