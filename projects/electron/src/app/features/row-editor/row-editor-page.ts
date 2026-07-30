import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { registerFifaDatePrototype } from 'fifadate';
import { Attribute, CalculateUtils, Fifa, Position, type FifaRatingAttributes } from 'fifarating';
import type { FieldDescriptor, TableValue } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

registerFifaDatePrototype();

const dateFields = new Set(['birthdate', 'playerjointeamdate', 'loandateend']);

@Component({
  selector: 'app-row-editor-page',
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './row-editor-page.html',
})
export class RowEditorPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  protected readonly databaseId = this.route.snapshot.paramMap.get('databaseId')!;
  protected readonly table = this.route.snapshot.paramMap.get('table')!;
  protected readonly rowId = Number(this.route.snapshot.paramMap.get('rowId')) || undefined;
  protected readonly editing = this.rowId !== undefined;
  protected readonly fields = signal<FieldDescriptor[]>([]);
  protected readonly model = signal<Record<string, string>>({});
  protected readonly rowForm = form(this.model);
  protected readonly ratingHint = computed(() => {
    if (this.table !== 'players') return undefined;
    const values = this.model();
    const position = Object.values(Position)[Number(values['preferredposition1'])];
    const stored = Number(values['overallrating']);
    if (!position || !Number.isFinite(stored)) return undefined;
    const attributes = Object.fromEntries(
      Object.values(Attribute).map((attribute) => [attribute, Number(values[attribute]) || 0]),
    ) as FifaRatingAttributes;
    const calculated = CalculateUtils.rawOverall(attributes, Fifa.Fifa16, position);
    return Number.isFinite(calculated)
      ? { calculated: Math.round(calculated), stored: Math.round(stored), position }
      : undefined;
  });

  constructor() {
    this.store.selectContext(this.projectId, this.databaseId);
    void this.initialize();
  }

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
            databaseId: this.databaseId,
            table: this.table,
            ...(this.rowId !== undefined ? { rowId: this.rowId } : {}),
            values: this.model(),
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
        await this.router.navigate(this.tableRoute());
      } catch {
        // Store exposes the error.
      }
    });
  }

  protected tableRoute(): unknown[] {
    return ['/projects', this.projectId, 'databases', this.databaseId, 'tables', this.table];
  }

  private async initialize(): Promise<void> {
    try {
      if (!this.store.projects().length) await this.store.refreshProjects();
      const tables = await this.store.operation(() => this.desktop.listTables(this.databaseId));
      const descriptor = tables.find((table) => table.name === this.table);
      if (!descriptor) throw new Error('Table was not found.');
      this.fields.set(descriptor.fields);
      if (this.rowId !== undefined) {
        const row = await this.store.operation(() =>
          this.desktop.readRow(this.databaseId, this.table, this.rowId!),
        );
        this.model.set(
          Object.fromEntries(
            Object.entries(row.values).map(([field, value]) => [field, String(value)]),
          ),
        );
      } else {
        this.model.set(
          Object.fromEntries(
            descriptor.fields.map((field) => [field.name, String(field.defaultValue)]),
          ),
        );
      }
    } catch {
      // Store exposes the error.
    }
  }

  private dateHint(field: string, value: TableValue | undefined): string {
    if (!dateFields.has(field)) return '';
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
