import { Component, type Signal, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import type { EntityFilterOptions, EntityKind } from '../../../../../shared/downloader/contracts';
import { EntityFilterForm, type EntityFilters } from '../entity-filter-form/entity-filter-form';

export interface EntityFilterDrawerData {
  entity: EntityKind;
  filters: EntityFilters;
  options: Signal<EntityFilterOptions | undefined>;
  loading: Signal<boolean>;
  error: Signal<string>;
  retry: () => void;
}

@Component({
  selector: 'app-entity-filter-drawer',
  imports: [EntityFilterForm],
  templateUrl: './entity-filter-drawer.html',
  styleUrl: './entity-filter-drawer.css',
})
export class EntityFilterDrawer {
  protected readonly data = inject<EntityFilterDrawerData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EntityFilterDrawer, EntityFilters>);

  protected apply(filters: EntityFilters): void {
    this.dialogRef.close(filters);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
