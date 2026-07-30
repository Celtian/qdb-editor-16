import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AboutDialog } from './about-dialog';
import { AppStore } from './app-store';

@Component({
  selector: 'app-navigation',
  imports: [
    NgOptimizedImage,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './app-navigation.html',
  styleUrl: './app-navigation.css',
})
export class AppNavigation {
  protected readonly store = inject(AppStore);
  private readonly dialog = inject(MatDialog);
  protected readonly databaseRoot = computed(() => {
    const project = this.store.activeProjectId();
    const database = this.store.activeDatabaseId();
    return project && database ? `/projects/${project}/databases/${database}` : '';
  });

  protected openAbout(): void {
    this.dialog.open(AboutDialog, {
      width: '35rem',
      maxWidth: 'calc(100vw - 2rem)',
      autoFocus: '[aria-label="Close About dialog"]',
      restoreFocus: true,
    });
  }
}
