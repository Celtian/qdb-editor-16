import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { registerFifaDatePrototype } from 'fifadate';
import { Attribute, CalculateUtils, Fifa, Position, type FifaRatingAttributes } from 'fifarating';
import type { FieldDescriptor, TableRow, TableValue } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';

registerFifaDatePrototype();

const dateFields = new Set(['birthdate', 'playerjointeamdate', 'loandateend']);
type RowEditorValue = TableValue | null;

const editorValue = (field: FieldDescriptor, value: TableValue): TableValue => {
  if (field.type === 'string') return String(value);
  if (typeof value === 'number') return value;
  const normalized = value.replace(',', '.').trim();
  return normalized === '' ? Number.NaN : Number(normalized);
};

export interface RowEditorDrawerData {
  databaseId: string;
  table: string;
  fields: readonly FieldDescriptor[];
  row?: TableRow;
}

@Component({
  selector: 'app-row-editor-drawer',
  imports: [
    CdkScrollable,
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './row-editor-drawer.html',
  styleUrl: './row-editor-drawer.css',
})
export class RowEditorDrawer {
  protected readonly data = inject<RowEditorDrawerData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RowEditorDrawer, boolean>);
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly editing = this.data.row !== undefined;
  protected readonly model = signal<Record<string, RowEditorValue>>(
    Object.fromEntries(
      this.data.fields.map((field) => [
        field.name,
        editorValue(field, this.data.row?.values[field.name] ?? field.defaultValue),
      ]),
    ),
  );
  protected readonly rowForm = form(this.model, (schema) => {
    for (const field of this.data.fields) {
      if (field.type === 'string') continue;
      const message =
        field.type === 'int' ? 'Enter a valid integer.' : 'Enter a valid decimal number.';
      required(schema[field.name], { message });
      validate(schema[field.name], ({ value }) => {
        const current = value();
        if (current === null || current === '') return undefined;
        if (typeof current !== 'number' || !Number.isFinite(current))
          return { kind: 'number', message };
        if (field.type === 'int' && !Number.isInteger(current)) return { kind: 'integer', message };
        return undefined;
      });
    }
  });
  protected readonly ratingHint = computed(() => {
    if (this.data.table !== 'players') return undefined;
    const values = this.model();
    const positionValue = values['preferredposition1'];
    const stored = values['overallrating'];
    if (typeof positionValue !== 'number' || typeof stored !== 'number') return undefined;
    const position = Object.values(Position)[positionValue];
    if (!position || !Number.isFinite(stored)) return undefined;
    const attributes = Object.fromEntries(
      Object.values(Attribute).map((attribute) => [attribute, Number(values[attribute]) || 0]),
    ) as FifaRatingAttributes;
    const calculated = CalculateUtils.rawOverall(attributes, Fifa.Fifa16, position);
    return Number.isFinite(calculated)
      ? { calculated: Math.round(calculated), stored: Math.round(stored), position }
      : undefined;
  });

  protected fieldHint(field: FieldDescriptor): string {
    const parts: string[] = [field.type];
    if (field.unique) parts.push('unique');
    if (field.range) parts.push(`${field.range.min}–${field.range.max}`);
    const date = this.dateHint(field.name, this.model()[field.name]);
    if (date) parts.push(date);
    return parts.join(' · ');
  }

  protected save(acceptWarnings = false): void {
    void submit(this.rowForm, async () => {
      try {
        const result = await this.store.operation(() =>
          this.desktop.saveRow({
            databaseId: this.data.databaseId,
            table: this.data.table,
            ...(this.data.row ? { rowId: this.data.row.rowId } : {}),
            values: this.valuesForSave(),
            acceptWarnings,
          }),
        );
        if (result.warnings.length && !acceptWarnings) {
          const confirmed = await this.dialog
            .open(ConfirmDialog, {
              data: {
                title: 'Save values outside published ranges?',
                message: result.warnings.map((warning) => warning.message).join(' '),
                confirmLabel: 'Save anyway',
              },
            })
            .afterClosed()
            .toPromise();
          if (confirmed) this.save(true);
          return;
        }
        this.dialogRef.close(true);
      } catch {
        // Store exposes the error.
      }
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  private valuesForSave(): Record<string, TableValue> {
    return Object.fromEntries(
      this.data.fields.map((field) => {
        const value = this.model()[field.name];
        return [field.name, value === null ? '' : value];
      }),
    );
  }

  private dateHint(field: string, value: RowEditorValue | undefined): string {
    if (!dateFields.has(field)) return '';
    if (value === null) return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    try {
      const date = Date.fromFifaDate(number);
      if (Number.isNaN(date.getTime())) return '';
      const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
      if (field !== 'birthdate') return formatted;
      const reference = this.store.activeProject()?.referenceDate;
      return reference
        ? `${formatted} · age ${date.age(new Date(`${reference}T00:00:00`))}`
        : formatted;
    } catch {
      return '';
    }
  }
}
