import { Component, inject, type Signal } from '@angular/core';
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
  template: `
    <app-entity-filter-form
      [entity]="data.entity"
      [initialFilters]="data.filters"
      [options]="data.options()"
      [loading]="data.loading()"
      [error]="data.error()"
      (filtersApplied)="apply($event)"
      (cancelled)="cancel()"
      (retryRequested)="data.retry()"
    />
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }
  `,
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
