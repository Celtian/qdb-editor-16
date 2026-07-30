import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { DatabaseDescriptor } from '../../../../shared/contracts';
import { AppStore } from '../../core/app-store';
import { ConfirmDialog } from '../../core/confirm-dialog';
import { DesktopApi } from '../../core/desktop-api';
import { NameDialog } from '../../core/name-dialog';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-databases-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    PageHeader,
    RouterLink,
  ],
  templateUrl: './databases-page.html',
})
export class DatabasesPage {
  private readonly route = inject(ActivatedRoute);
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId')!;

  constructor() {
    void this.initialize();
  }

  protected async rename(database: DatabaseDescriptor): Promise<void> {
    const name = await this.dialog
      .open(NameDialog, {
        data: { title: 'Rename database', label: 'Database name', value: database.name },
        width: '28rem',
        maxWidth: 'calc(100vw - 2rem)',
      })
      .afterClosed()
      .toPromise();
    if (!name || name === database.name) return;
    try {
      await this.store.operation(() => this.desktop.renameDatabase(database.id, name));
      await this.store.refreshDatabases(this.projectId);
    } catch {
      // Store exposes the error.
    }
  }

  protected async remove(database: DatabaseDescriptor): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: `Delete ${database.name}?`,
          message:
            'This permanently removes the managed SQLite file. Its original import and previous external exports are not affected.',
          confirmLabel: 'Delete database',
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    try {
      await this.store.operation(() => this.desktop.removeDatabase(database.id));
      await this.store.refreshDatabases(this.projectId);
    } catch {
      // Store exposes the error.
    }
  }

  private async initialize(): Promise<void> {
    if (!this.store.projects().length) await this.store.refreshProjects();
    await this.store.refreshDatabases(this.projectId);
  }
}
