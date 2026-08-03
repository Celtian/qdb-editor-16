import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import type { EntityKind } from '../../../../../shared/downloader/contracts';
import type { ColumnDefinition, ColumnPreference } from '../entity-column-editor/column-layout';
import { EntityColumnEditor } from '../entity-column-editor/entity-column-editor';

export interface EntityColumnDrawerData {
  entity: EntityKind;
  columns: readonly ColumnDefinition[];
  preference: ColumnPreference;
  defaultPreference: ColumnPreference;
}

@Component({
  selector: 'app-entity-column-drawer',
  imports: [CdkScrollable, EntityColumnEditor, MatButtonModule, MatIconModule],
  templateUrl: './entity-column-drawer.html',
  styleUrl: './entity-column-drawer.css',
})
export class EntityColumnDrawer {
  protected readonly data = inject<EntityColumnDrawerData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EntityColumnDrawer, ColumnPreference>);
  private readonly editor = viewChild.required(EntityColumnEditor);
  protected readonly draftPreference = signal(this.data.preference);

  protected resetDefaults(): void {
    this.editor().resetToDefaults();
  }

  protected apply(): void {
    this.dialogRef.close(this.draftPreference());
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
