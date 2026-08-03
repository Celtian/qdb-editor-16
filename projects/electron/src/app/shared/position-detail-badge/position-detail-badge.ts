import { Component, computed, input } from '@angular/core';

import type { PlayerPosition, PlayerPositionDetail } from '../../../../shared/downloader/contracts';
import { positionBadgeDetails } from '../position-badge/position-badge';

export const positionDetailGroups: Record<PlayerPositionDetail, PlayerPosition> = {
  GK: 'GOALKEEPER',
  SW: 'DEFENDER',
  LWB: 'DEFENDER',
  LB: 'DEFENDER',
  LCB: 'DEFENDER',
  CB: 'DEFENDER',
  RCB: 'DEFENDER',
  RB: 'DEFENDER',
  RWB: 'DEFENDER',
  LDM: 'MIDFIELDER',
  CDM: 'MIDFIELDER',
  RDM: 'MIDFIELDER',
  LM: 'MIDFIELDER',
  LCM: 'MIDFIELDER',
  CM: 'MIDFIELDER',
  RCM: 'MIDFIELDER',
  RM: 'MIDFIELDER',
  LAM: 'MIDFIELDER',
  CAM: 'MIDFIELDER',
  RAM: 'MIDFIELDER',
  LW: 'ATTACKER',
  LF: 'ATTACKER',
  CF: 'ATTACKER',
  RF: 'ATTACKER',
  RW: 'ATTACKER',
  LS: 'ATTACKER',
  ST: 'ATTACKER',
  RS: 'ATTACKER',
};

@Component({
  selector: 'app-position-detail-badge',
  template: `
    <abbr
      [class]="details().className"
      [attr.aria-label]="'Detailed position ' + positionDetail()"
      [title]="positionDetail()"
    >
      {{ positionDetail() }}
    </abbr>
  `,
  host: { class: 'inline-block' },
})
export class PositionDetailBadge {
  readonly positionDetail = input.required<PlayerPositionDetail>();
  protected readonly details = computed(
    () => positionBadgeDetails[positionDetailGroups[this.positionDetail()]],
  );
}
