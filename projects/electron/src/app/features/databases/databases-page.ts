import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, input, type OnChanges, type SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
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
  styleUrl: './databases-page.css',
})
export class DatabasesPage implements OnChanges {
  private readonly desktop = inject(DesktopApi);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(AppStore);
  protected readonly projectId = input.required<string>();
  private initializeSequence = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['projectId']) return;
    const sequence = ++this.initializeSequence;
    void this.initialize(this.projectId(), sequence);
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
    const projectId = this.projectId();
    try {
      await this.store.operation(() => this.desktop.renameDatabase(database.id, name));
      await this.store.refreshDatabases(projectId);
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
    const projectId = this.projectId();
    try {
      await this.store.operation(() => this.desktop.removeDatabase(database.id));
      await this.store.refreshDatabases(projectId);
    } catch {
      // Store exposes the error.
    }
  }

  private async initialize(projectId: string, sequence: number): Promise<void> {
    if (!this.store.projects().length) await this.store.refreshProjects();
    if (sequence !== this.initializeSequence) return;
    await this.store.refreshDatabases(projectId);
  }
}
