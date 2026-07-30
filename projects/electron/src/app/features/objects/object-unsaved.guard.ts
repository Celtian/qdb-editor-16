import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { CanDeactivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog } from '../../core/confirm-dialog';

export interface ObjectDirtyComponent {
  hasUnsavedChanges(): boolean;
}

export const objectUnsavedGuard: CanDeactivateFn<ObjectDirtyComponent> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  const dialog = inject(MatDialog);
  return firstValueFrom(
    dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Discard unsaved changes?',
          message: 'Changes made in this object section have not been saved.',
          confirmLabel: 'Discard changes',
        },
      })
      .afterClosed(),
  ).then(Boolean);
};
