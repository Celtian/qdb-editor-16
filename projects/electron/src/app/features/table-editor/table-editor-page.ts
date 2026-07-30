import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  FieldDescriptor,
  TablePage,
  TableRow,
  TableRowValues,
  TableValue,
} from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-table-editor-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './table-editor-page.html',
})
export class TableEditorPage {
  private readonly route = inject(ActivatedRoute);
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;
  protected readonly databaseId = this.route.snapshot.paramMap.get('databaseId')!;
  protected readonly table = this.route.snapshot.paramMap.get('table')!;
  protected readonly page = signal<TablePage | undefined>(undefined);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly query = signal('');
  protected readonly sortField = signal('');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly visibleFields = signal<string[]>([]);
  protected readonly editingRowId = signal<number | undefined>(undefined);
  protected readonly draft = signal<TableRowValues>({});
  protected readonly displayedColumns = computed(() => [...this.visibleFields(), '__actions']);
  private queryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.store.selectContext(this.projectId, this.databaseId);
    void this.load();
  }

  protected toggleField(field: FieldDescriptor, checked: boolean): void {
    this.visibleFields.update((fields) =>
      checked ? [...fields, field.name] : fields.filter((candidate) => candidate !== field.name),
    );
  }

  protected queryChanged(value: string): void {
    this.query.set(value);
    this.pageIndex.set(0);
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => void this.load(), 250);
  }

  protected pageChanged(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    void this.load();
  }

  protected sortChanged(sort: Sort): void {
    this.sortField.set(sort.direction ? sort.active : '');
    this.sortDirection.set(sort.direction === 'desc' ? 'desc' : 'asc');
    this.pageIndex.set(0);
    void this.load();
  }

  protected startInline(row: TableRow): void {
    this.editingRowId.set(row.rowId);
    this.draft.set({ ...row.values });
  }

  protected cancelInline(): void {
    this.editingRowId.set(undefined);
    this.draft.set({});
  }

  protected draftValue(field: string): TableValue {
    return this.draft()[field] ?? '';
  }

  protected setDraftValue(field: FieldDescriptor, value: string): void {
    const normalized: TableValue =
      field.type === 'string' || value === '' ? value : Number(value.replace(',', '.'));
    this.draft.update((draft) => ({ ...draft, [field.name]: normalized }));
  }

  protected async saveInline(acceptWarnings = false): Promise<void> {
    const rowId = this.editingRowId();
    if (rowId === undefined) return;
    try {
      const result = await this.store.operation(() =>
        this.desktop.saveRow({
          databaseId: this.databaseId,
          table: this.table,
          rowId,
          values: this.draft(),
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
        if (confirmed) await this.saveInline(true);
        return;
      }
      this.cancelInline();
      await this.load();
    } catch {
      // Store exposes the error.
    }
  }

  protected async remove(row: TableRow): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Delete row ${row.rowId}?`,
          message: 'This removes the row from the managed database and cannot be undone.',
          confirmLabel: 'Delete row',
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    try {
      await this.store.operation(() =>
        this.desktop.deleteRow({
          databaseId: this.databaseId,
          table: this.table,
          rowId: row.rowId,
        }),
      );
      await this.load();
    } catch {
      // Store exposes the error.
    }
  }

  protected value(row: TableRow, field: string): TableValue {
    return row.values[field] ?? '';
  }

  protected fieldByName(name: string): FieldDescriptor | undefined {
    return this.page()?.fields.find((field) => field.name === name);
  }

  private async load(): Promise<void> {
    try {
      const page = await this.store.operation(() =>
        this.desktop.readTable({
          databaseId: this.databaseId,
          table: this.table,
          pageIndex: this.pageIndex(),
          pageSize: this.pageSize(),
          query: this.query(),
          ...(this.sortField()
            ? { sortField: this.sortField(), sortDirection: this.sortDirection() }
            : {}),
        }),
      );
      this.page.set(page);
      if (!this.visibleFields().length)
        this.visibleFields.set(page.fields.slice(0, 8).map((field) => field.name));
    } catch {
      // Store exposes the error.
    }
  }
}
