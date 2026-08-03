import {
  Component,
  type OnChanges,
  type SimpleChanges,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import type {
  ObjectKind,
  ObjectListPage as ObjectListPageData,
  ObjectSummary,
  TableValue,
} from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { PageHeader } from '../../shared/page-header/page-header';
import { OBJECT_CONFIG } from './object-config';
import { ObjectEditorDialog, type ObjectEditorDialogData } from './object-editor-dialog';

@Component({
  selector: 'app-object-list-page',
  imports: [
    MatButtonModule,
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
  templateUrl: './object-list-page.html',
})
export class ObjectListPage implements OnChanges {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  readonly projectId = input.required<string>();
  readonly databaseId = input.required<string>();
  readonly kind = input.required<ObjectKind>();
  protected readonly page = signal<ObjectListPageData | undefined>(undefined);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  protected readonly query = signal('');
  protected readonly sortField = signal('id');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly blockedMessage = signal('');
  protected readonly config = computed(() => OBJECT_CONFIG[this.kind()]);
  protected readonly displayedColumns = computed(() => [
    ...this.config().columns.map((column) => column.key),
    ...(this.config().canEditRoot || this.config().canDelete ? ['__actions'] : []),
  ]);
  private queryTimer: ReturnType<typeof setTimeout> | undefined;
  private loadSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId'] && !changes['databaseId'] && !changes['kind']) return;
    clearTimeout(this.queryTimer);
    this.page.set(undefined);
    this.pageIndex.set(0);
    this.query.set('');
    this.sortField.set('id');
    this.sortDirection.set('asc');
    this.blockedMessage.set('');
    this.store.selectContext(this.projectId(), this.databaseId());
    void this.initialize();
  }

  protected value(item: ObjectSummary, key: string): TableValue {
    if (key === 'id') return item.id;
    if (key === 'name') return item.name;
    return item.values[key] ?? '';
  }

  protected queryChanged(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
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
    this.sortField.set(sort.direction ? sort.active : 'id');
    this.sortDirection.set(sort.direction === 'desc' ? 'desc' : 'asc');
    this.pageIndex.set(0);
    void this.load();
  }

  protected openEditor(item?: ObjectSummary): void {
    this.dialog
      .open<ObjectEditorDialog, ObjectEditorDialogData, boolean>(ObjectEditorDialog, {
        ariaDescribedBy: 'object-editor-description',
        data: {
          databaseId: this.databaseId(),
          kind: this.kind(),
          ...(item ? { id: item.id } : {}),
        },
        maxWidth: 'calc(100vw - 2rem)',
        restoreFocus: true,
        width: '46rem',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.reloadAfterMutation();
      });
  }

  protected async remove(item: ObjectSummary): Promise<void> {
    this.blockedMessage.set('');
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: `Delete ${item.name}?`,
            message:
              'The object will only be deleted when no FIFA rows reference it. This cannot be undone.',
            confirmLabel: `Delete ${this.config().singular}`,
          },
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    try {
      const result = await this.store.operation(() =>
        this.desktop.deleteObject({
          databaseId: this.databaseId(),
          kind: this.kind(),
          id: item.id,
        }),
      );
      if (!result.deleted) {
        this.blockedMessage.set(
          `Delete blocked: ${result.dependencies
            .map((dependency) => `${dependency.count} ${dependency.table}.${dependency.field}`)
            .join(', ')}.`,
        );
        return;
      }
      await this.reloadAfterMutation();
    } catch {
      // The store exposes the error.
    }
  }

  private async initialize(): Promise<void> {
    if (!this.store.projects().length) await this.store.refreshProjects();
    await this.store.refreshDatabases(this.projectId());
    await this.load();
  }

  private async reloadAfterMutation(): Promise<void> {
    await Promise.all([this.load(), this.store.refreshTables(this.databaseId())]);
  }

  private async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    try {
      const page = await this.store.operation(() =>
        this.desktop.listObjects({
          databaseId: this.databaseId(),
          kind: this.kind(),
          pageIndex: this.pageIndex(),
          pageSize: this.pageSize(),
          query: this.query(),
          sortField: this.sortField(),
          sortDirection: this.sortDirection(),
        }),
      );
      if (sequence === this.loadSequence) this.page.set(page);
    } catch {
      // The store exposes the error.
    }
  }
}
