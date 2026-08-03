import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';

import { defaultSourcePriority } from '../../../../../shared/downloader/combined-data';
import { type SourceName, sourceLabels } from '../../../../../shared/downloader/contracts';
import { DesktopApi } from '../../../core/downloader-api';
import { PageHeader } from '../../../shared/page-header/page-header';

@Component({
  selector: 'app-source-settings-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    PageHeader,
  ],
  templateUrl: './source-settings-page.html',
  styleUrl: './source-settings-page.css',
})
export class SourceSettingsPage {
  private readonly api = inject(DesktopApi);
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly priority = signal<SourceName[]>([...defaultSourcePriority]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly sourceLabels = sourceLabels;

  constructor() {
    void this.load();
  }

  protected drop(event: CdkDragDrop<SourceName[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.priority()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.priority.set(next);
    void this.save(
      `${sourceLabels[next[event.currentIndex]]} moved to priority ${event.currentIndex + 1}.`,
    );
  }

  protected move(sourceName: SourceName, direction: -1 | 1): void {
    const next = [...this.priority()];
    const currentIndex = next.indexOf(sourceName);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= next.length) return;
    moveItemInArray(next, currentIndex, targetIndex);
    this.priority.set(next);
    void this.save(`${sourceLabels[sourceName]} moved to priority ${targetIndex + 1}.`);
  }

  protected reset(): void {
    this.priority.set([...defaultSourcePriority]);
    void this.save('Source priority reset to the default order.');
  }

  private async load(): Promise<void> {
    const result = await this.api.getSourcePriority();
    this.loading.set(false);
    if (result.ok) {
      this.priority.set(result.value);
      return;
    }
    this.error.set(result.error.message);
  }

  private async save(announcement: string): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    const result = await this.api.updateSourcePriority([...this.priority()]);
    this.saving.set(false);
    if (!result.ok) {
      this.error.set(result.error.message);
      this.snackBar.open(result.error.message, 'Dismiss', { duration: 6000 });
      await this.load();
      return;
    }
    this.priority.set(result.value);
    await this.liveAnnouncer.announce(announcement);
  }
}
