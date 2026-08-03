import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import type {
  FieldDescriptor,
  ObjectKind,
  TableRowValues,
  TableValue,
} from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { OBJECT_CONFIG, createFields } from './object-config';
import { ObjectValueField } from './object-value-field';

export interface ObjectEditorDialogData {
  databaseId: string;
  kind: ObjectKind;
  id?: number;
}

@Component({
  selector: 'app-object-editor-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, ObjectValueField],
  templateUrl: './object-editor-dialog.html',
})
export class ObjectEditorDialog {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<ObjectEditorDialog, boolean>);
  protected readonly store = inject(AppStore);
  protected readonly data = inject<ObjectEditorDialogData>(MAT_DIALOG_DATA);
  protected readonly config = OBJECT_CONFIG[this.data.kind];
  protected readonly fields = signal<FieldDescriptor[]>([]);
  protected readonly values = signal<TableRowValues>({});

  constructor() {
    if (this.data.id === undefined) {
      const fields = createFields(this.data.kind);
      this.fields.set(fields);
      this.values.set(Object.fromEntries(fields.map((field) => [field.name, field.defaultValue])));
      void this.applyCreateDefaults();
    } else {
      void this.initialize();
    }
  }

  protected fieldValue(field: FieldDescriptor): TableValue {
    return this.values()[field.name] ?? field.defaultValue;
  }

  protected updateValue(name: string, value: TableValue): void {
    this.values.update((current) => ({ ...current, [name]: value }));
  }

  protected async save(acceptWarnings: boolean): Promise<void> {
    try {
      const result = await this.store.operation(() =>
        this.desktop.saveObject({
          databaseId: this.data.databaseId,
          kind: this.data.kind,
          ...(this.data.id === undefined ? {} : { id: this.data.id }),
          section: 'root',
          values: this.values(),
          acceptWarnings,
        }),
      );
      if (result.warnings.length && !acceptWarnings) {
        const confirmed = await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, {
              data: {
                title: 'Save with validation warnings?',
                message: result.warnings.map((warning) => warning.message).join(' '),
                confirmLabel: 'Save anyway',
              },
            })
            .afterClosed(),
        );
        if (confirmed) await this.save(true);
        return;
      }
      this.dialogRef.close(true);
    } catch {
      // The store exposes the error in the dialog.
    }
  }

  private async initialize(): Promise<void> {
    try {
      const detail = await this.store.operation(() =>
        this.desktop.readObject({
          databaseId: this.data.databaseId,
          kind: this.data.kind,
          id: this.data.id!,
          section: 'root',
        }),
      );
      const immutableKey = detail.fields.find((field) => field.unique)?.name;
      this.fields.set(detail.fields.filter((field) => field.name !== immutableKey));
      this.values.set(detail.values);
    } catch {
      // The store exposes the error in the dialog.
    }
  }

  private async applyCreateDefaults(): Promise<void> {
    try {
      const settings = await this.store.operation(() =>
        this.desktop.getDatabaseObjectSettings(this.data.databaseId),
      );
      const ids: Partial<Record<ObjectKind, number>> = {
        countries: settings.ids.country,
        leagues: settings.ids.league,
        teams: settings.ids.team,
        players: settings.ids.player,
        referees: settings.ids.referee,
      };
      this.values.update((current) => {
        const next = { ...current };
        const idField = this.fields().find((field) => field.unique);
        const id = ids[this.data.kind];
        if (idField && id !== undefined) next[idField.name] = id;
        if (this.data.kind === 'referees') next['birthdate'] = settings.dates.date;
        return next;
      });
    } catch {
      // The store exposes the error in the dialog.
    }
  }
}
