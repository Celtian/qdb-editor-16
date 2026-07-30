import {
  Component,
  computed,
  inject,
  input,
  type OnChanges,
  signal,
  type SimpleChanges,
} from '@angular/core';
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
import { RouterLink } from '@angular/router';
import type {
  FieldDescriptor,
  TablePage,
  TableRow,
  TableValue,
} from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';
import { RowEditorDrawer, type RowEditorDrawerData } from '../row-editor/row-editor-drawer';

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
export class TableEditorPage implements OnChanges {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = input.required<string>();
  protected readonly databaseId = input.required<string>();
  protected readonly table = input.required<string>();
  protected readonly page = signal<TablePage | undefined>(undefined);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly query = signal('');
  protected readonly sortField = signal('');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly visibleFields = signal<string[]>([]);
  protected readonly displayedColumns = computed(() => [...this.visibleFields(), '__actions']);
  private queryTimer: ReturnType<typeof setTimeout> | undefined;
  private loadSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId'] && !changes['databaseId'] && !changes['table']) return;

    clearTimeout(this.queryTimer);
    this.page.set(undefined);
    this.pageIndex.set(0);
    this.query.set('');
    this.sortField.set('');
    this.sortDirection.set('asc');
    this.visibleFields.set([]);
    this.store.selectContext(this.projectId(), this.databaseId());
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

  protected openRowEditor(row?: TableRow): void {
    const fields = this.page()?.fields;
    if (!fields) return;
    const databaseId = this.databaseId();
    const table = this.table();
    this.dialog
      .open<RowEditorDrawer, RowEditorDrawerData, boolean>(RowEditorDrawer, {
        ariaDescribedBy: 'row-editor-description',
        ariaLabelledBy: 'row-editor-title',
        ariaModal: true,
        autoFocus: '[data-row-editor-primary-field]',
        data: {
          databaseId,
          table,
          fields,
          ...(row ? { row } : {}),
        },
        delayFocusTrap: false,
        disableClose: false,
        height: '100vh',
        maxHeight: '100vh',
        maxWidth: '100vw',
        panelClass: 'row-editor-drawer-panel',
        position: { right: '0', top: '0' },
        restoreFocus: true,
        width: '36rem',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.load();
      });
  }

  protected async remove(row: TableRow): Promise<void> {
    const databaseId = this.databaseId();
    const table = this.table();
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
          databaseId,
          table,
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

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    const databaseId = this.databaseId();
    const table = this.table();
    try {
      const page = await this.store.operation(() =>
        this.desktop.readTable({
          databaseId,
          table,
          pageIndex: this.pageIndex(),
          pageSize: this.pageSize(),
          query: this.query(),
          ...(this.sortField()
            ? { sortField: this.sortField(), sortDirection: this.sortDirection() }
            : {}),
        }),
      );
      if (sequence !== this.loadSequence) return;
      this.page.set(page);
      if (!this.visibleFields().length)
        this.visibleFields.set(page.fields.slice(0, 8).map((field) => field.name));
    } catch {
      // Store exposes the error.
    }
  }
}
