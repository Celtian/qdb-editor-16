import { Component, computed, inject, signal } from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { ProjectSummary } from '../../../../../shared/downloader/contracts';
import { DesktopApi } from '../../../core/downloader-api';
import { AboutDialogService } from '../../../shared/about-dialog/about-dialog';
import { ReferenceDatePipe } from '../../../shared/reference-date-pipe';

@Component({
  selector: 'app-project-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
    ReferenceDatePipe,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './project-shell.html',
  styleUrl: './project-shell.css',
})
export class ProjectShell {
  private readonly api = inject(DesktopApi);
  private readonly aboutDialog = inject(AboutDialogService);
  private readonly route = inject(ActivatedRoute);
  protected readonly router = inject(Router);
  protected readonly projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
  private readonly loadedProject = signal<ProjectSummary | undefined>(undefined);
  protected readonly project = computed(() => {
    const updatedProject = this.api.projectUpdated();
    return updatedProject?.id === this.projectId ? updatedProject : this.loadedProject();
  });
  protected readonly error = signal('');
  protected readonly linkGroups = [
    {
      id: 'overview',
      label: 'Project',
      links: [
        { path: 'overview', icon: 'dashboard', label: 'Overview' },
        { path: 'settings', icon: 'settings', label: 'Settings' },
        { path: 'export', icon: 'file_download', label: 'Export' },
      ],
    },
    {
      id: 'data',
      label: 'Source data',
      links: [
        { path: 'import', icon: 'cloud_download', label: 'Import' },
        { path: 'leagues', icon: 'emoji_events', label: 'Leagues' },
        { path: 'teams', icon: 'shield', label: 'Teams' },
        { path: 'players', icon: 'groups', label: 'Players' },
      ],
    },
    {
      id: 'combined',
      label: 'Combined data',
      links: [
        { path: 'combined/import', icon: 'cloud_download', label: 'Import' },
        { path: 'combined/leagues', icon: 'emoji_events', label: 'Leagues' },
        { path: 'combined/teams', icon: 'shield', label: 'Teams' },
        { path: 'combined/players', icon: 'groups', label: 'Players' },
      ],
    },
  ] as const;

  constructor() {
    void this.loadProject();
  }

  protected openAbout(): void {
    this.aboutDialog.open();
  }

  private async loadProject(): Promise<void> {
    const result = await this.api.getProjectSummary(this.projectId);
    if (result.ok) this.loadedProject.set(result.value);
    else this.error.set(result.error.message);
  }
}
