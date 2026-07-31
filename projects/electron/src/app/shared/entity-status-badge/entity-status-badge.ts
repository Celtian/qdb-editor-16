import { Component, computed, inject, input } from '@angular/core';
import type {
  EntityStatus,
  EntityStatusSettings,
} from '../../../../shared/downloader/entity-status';
import { formatUiNumber } from '../../../../shared/downloader/ui-format';
import { EntityStatusSettingsService } from '../../core/entity-status-settings.service';

interface EntityStatusDetails {
  className: string;
  label: string;
  description: string;
}

export const entityStatusDetails: Record<EntityStatus, EntityStatusDetails> = {
  new: {
    className: 'entity-status-badge entity-status-badge--new',
    label: 'New',
    description: 'Created within the last 3 days',
  },
  old: {
    className: 'entity-status-badge entity-status-badge--old',
    label: 'Old',
    description: 'Last updated at least 6 months before the project reference date',
  },
};

export function entityStatusDescription(
  status: EntityStatus,
  settings: EntityStatusSettings,
): string {
  if (status === 'new') {
    return `Created within the last ${formatUiNumber(settings.newDays)} ${
      settings.newDays === 1 ? 'day' : 'days'
    }`;
  }
  return `Last updated at least ${formatUiNumber(settings.oldMonths)} ${
    settings.oldMonths === 1 ? 'month' : 'months'
  } before the project reference date`;
}

@Component({
  selector: 'app-entity-status-badge',
  template: `
    <span [class]="details().className" [title]="details().description">
      {{ details().label }}
    </span>
  `,
  styleUrl: './entity-status-badge.css',
})
export class EntityStatusBadge {
  private readonly settings = inject(EntityStatusSettingsService);
  readonly status = input.required<EntityStatus>();
  protected readonly details = computed(() => {
    const status = this.status();
    return {
      ...entityStatusDetails[status],
      description: entityStatusDescription(status, this.settings.settings()),
    };
  });
}
