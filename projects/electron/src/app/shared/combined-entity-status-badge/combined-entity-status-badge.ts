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
    className:
      'qdb-record-status-badge inline-flex items-center gap-status-gap whitespace-nowrap rounded-full bg-tertiary-container px-2.5 py-0 text-xs font-bold leading-6 text-on-tertiary-container',
    description: 'All linked source records are still available.',
    icon: 'check_circle',
    label: 'Ready',
  },
  needsReview: {
    className:
      'qdb-record-status-badge inline-flex items-center gap-status-gap whitespace-nowrap rounded-full bg-error-container px-2.5 py-0 text-xs font-bold leading-6 text-on-error-container',
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
  templateUrl: './combined-entity-status-badge-inline-1.html',
  styleUrl: './combined-entity-status-badge.css',
  host: { class: 'inline-flex' },
})
export class CombinedEntityStatusBadge {
  readonly status = input.required<CombinedEntityStatus>();
  readonly entityKind = input<CombinedEntityKind>();
  protected readonly details = computed(() => combinedEntityStatusDetails[this.status()]);
  protected readonly description = computed(() =>
    combinedEntityStatusDescription(this.status(), this.entityKind()),
  );
}
