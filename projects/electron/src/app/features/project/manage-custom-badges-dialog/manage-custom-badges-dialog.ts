import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import type { EntityKind } from '../../../../../shared/downloader/contracts';
import type { CustomBadge } from '../../../../../shared/downloader/custom-badge';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';

type BadgeState = 'all' | 'some' | 'none';

interface BadgeSelection {
  initial: BadgeState;
  current: BadgeState;
}

export interface ManageCustomBadgesDialogData {
  entity: EntityKind;
  entities: readonly { customBadges?: readonly CustomBadge[] }[];
  badges: readonly CustomBadge[];
  settingsPathLabel?: string;
}

export interface ManageCustomBadgesDialogValue {
  addBadgeIds: string[];
  removeBadgeIds: string[];
}

@Component({
  selector: 'app-manage-custom-badges-dialog',
  imports: [CustomBadgeView, DecimalPipe, MatButtonModule, MatCheckboxModule, MatDialogModule],
  templateUrl: './manage-custom-badges-dialog.html',
})
export class ManageCustomBadgesDialog {
  protected readonly data = inject<ManageCustomBadgesDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<ManageCustomBadgesDialog, ManageCustomBadgesDialogValue>,
  );
  private readonly selections = signal<Record<string, BadgeSelection>>(
    Object.fromEntries(
      this.data.badges.map((badge) => {
        const assignedCount = this.data.entities.filter((entity) =>
          (entity.customBadges ?? []).some(({ id }) => id === badge.id),
        ).length;
        const initial: BadgeState =
          assignedCount === 0
            ? 'none'
            : assignedCount === this.data.entities.length
              ? 'all'
              : 'some';
        return [badge.id, { initial, current: initial }];
      }),
    ),
  );
  protected readonly hasMixedBadges = computed(() =>
    Object.values(this.selections()).some(({ initial }) => initial === 'some'),
  );
  protected readonly hasChanges = computed(() =>
    Object.values(this.selections()).some(({ initial, current }) => initial !== current),
  );

  protected stateFor(id: string): BadgeState {
    return this.selections()[id].current;
  }

  protected setState(id: string, checked: boolean): void {
    this.selections.update((selections) => ({
      ...selections,
      [id]: {
        ...selections[id],
        current: checked ? 'all' : 'none',
      },
    }));
  }

  protected singularEntity(): string {
    return this.data.entity === 'leagues'
      ? 'league'
      : this.data.entity === 'teams'
        ? 'team'
        : 'player';
  }

  protected save(): void {
    const selections = this.selections();
    this.dialogRef.close({
      addBadgeIds: Object.entries(selections)
        .filter(([, { initial, current }]) => current === 'all' && initial !== 'all')
        .map(([id]) => id),
      removeBadgeIds: Object.entries(selections)
        .filter(([, { initial, current }]) => current === 'none' && initial !== 'none')
        .map(([id]) => id),
    });
  }
}
