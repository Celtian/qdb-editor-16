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
  template: `
    <h2 mat-dialog-title>Manage custom badges</h2>
    <mat-dialog-content>
      <p>
        Update badges for {{ data.entities.length | number }}
        {{ data.entities.length === 1 ? singularEntity() : data.entity }}.
      </p>
      @if (data.badges.length) {
        <div class="badge-options" role="group" aria-label="Custom badges">
          @for (badge of data.badges; track badge.id) {
            <mat-checkbox
              [checked]="stateFor(badge.id) === 'all'"
              [indeterminate]="stateFor(badge.id) === 'some'"
              (change)="setState(badge.id, $event.checked)"
            >
              <app-custom-badge [badge]="badge" />
            </mat-checkbox>
          }
        </div>
        @if (hasMixedBadges()) {
          <p class="hint">
            A mixed checkbox means the badge is assigned to only some selected records. Leave it
            unchanged to preserve those assignments.
          </p>
        }
      } @else {
        <p>
          No custom badges exist yet. Create one in
          {{ data.settingsPathLabel ?? 'Global settings → Badges' }}.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button matButton="filled" type="button" [disabled]="!hasChanges()" (click)="save()">
        Apply badges
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .badge-options {
      display: grid;
      gap: 0.5rem;
      min-width: min(24rem, 70vw);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      max-width: 32rem;
    }
  `,
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
