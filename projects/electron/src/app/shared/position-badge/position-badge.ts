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
    className: 'position-badge position-badge--goalkeeper',
    label: 'Goalkeeper',
  },
  DEFENDER: {
    abbreviation: 'DEF',
    className: 'position-badge position-badge--defender',
    label: 'Defender',
  },
  MIDFIELDER: {
    abbreviation: 'MID',
    className: 'position-badge position-badge--midfielder',
    label: 'Midfielder',
  },
  ATTACKER: {
    abbreviation: 'ATT',
    className: 'position-badge position-badge--attacker',
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
  styleUrl: './position-badge.css',
})
export class PositionBadge {
  readonly position = input.required<PlayerPosition>();
  protected readonly details = computed(() => positionBadgeDetails[this.position()]);
}
