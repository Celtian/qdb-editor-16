import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { CombinedEntityKind } from '../../../../shared/downloader/contracts';

export const combinedEntityStatuses = ['ready', 'needsReview'] as const;

export type CombinedEntityStatus = (typeof combinedEntityStatuses)[number];

interface CombinedEntityStatusDetails {
  className: string;
  description: string;
  icon: string;
  label: string;
}

export const combinedEntityStatusDetails: Record<
  CombinedEntityStatus,
  CombinedEntityStatusDetails
> = {
  ready: {
    className: 'record-status-badge record-status-badge--ready',
    description: 'All linked source records are still available.',
    icon: 'check_circle',
    label: 'Ready',
  },
  needsReview: {
    className: 'record-status-badge record-status-badge--needs-review',
    description: 'One or more linked source records are missing. Review this combined record.',
    icon: 'warning',
    label: 'Needs review',
  },
};

const entityStatusDescriptions: Record<CombinedEntityKind, Record<CombinedEntityStatus, string>> = {
  leagues: {
    ready: 'All source leagues linked to this project league are still available.',
    needsReview:
      'One or more source leagues linked to this project league are missing. Review this project league.',
  },
  teams: {
    ready: 'All source teams and players linked to this project team are still available.',
    needsReview:
      'One or more source teams or players linked to this project team are missing. Review this project team.',
  },
  players: {
    ready: 'All source players linked to this project player are still available.',
    needsReview:
      'One or more source players linked to this project player are missing. Review this project player.',
  },
};

export function combinedEntityStatusDescription(
  status: CombinedEntityStatus,
  entityKind?: CombinedEntityKind,
): string {
  return entityKind
    ? entityStatusDescriptions[entityKind][status]
    : combinedEntityStatusDetails[status].description;
}

@Component({
  selector: 'app-combined-entity-status-badge',
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span
      [class]="details().className"
      [matTooltip]="description()"
      matTooltipPosition="above"
      tabindex="0"
    >
      <mat-icon aria-hidden="true">{{ details().icon }}</mat-icon>
      {{ details().label }}
    </span>
  `,
  styleUrl: './combined-entity-status-badge.css',
})
export class CombinedEntityStatusBadge {
  readonly status = input.required<CombinedEntityStatus>();
  readonly entityKind = input<CombinedEntityKind>();
  protected readonly details = computed(() => combinedEntityStatusDetails[this.status()]);
  protected readonly description = computed(() =>
    combinedEntityStatusDescription(this.status(), this.entityKind()),
  );
}
