import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  type UrlTree,
} from '@angular/router';

import { AboutDialogService } from '../../../shared/about-dialog/about-dialog';

@Component({
  selector: 'app-global-settings-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './global-settings-shell.html',
  styleUrl: './global-settings-shell.css',
})
export class GlobalSettingsShell {
  private readonly aboutDialog = inject(AboutDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly returnDestination = this.createReturnDestination();
  protected readonly linkGroups = [
    {
      id: 'application',
      label: 'Application',
      links: [
        { path: 'general', icon: 'tune', label: 'General' },
        { path: 'export', icon: 'file_download', label: 'Export' },
      ],
    },
    {
      id: 'source-data',
      label: 'Source data',
      links: [
        { path: 'sources', icon: 'swap_vert', label: 'Sources' },
        { path: 'badges', icon: 'sell', label: 'Badges' },
        { path: 'columns', icon: 'view_column', label: 'Columns' },
      ],
    },
    {
      id: 'combined-data',
      label: 'Combined data',
      links: [
        { path: 'combined/badges', icon: 'sell', label: 'Badges' },
        { path: 'combined/columns', icon: 'view_column', label: 'Columns' },
      ],
    },
  ] as const;

  protected openAbout(): void {
    this.aboutDialog.open();
  }

  private createReturnDestination(): { url: UrlTree; label: string } {
    const redirectUrl = this.route.snapshot.queryParamMap.get('redirectUrl');
    if (!redirectUrl?.startsWith('/projects/')) {
      return { url: this.router.parseUrl('/'), label: 'Projects' };
    }

    try {
      return { url: this.router.parseUrl(redirectUrl), label: 'Back to project' };
    } catch {
      return { url: this.router.parseUrl('/'), label: 'Projects' };
    }
  }
}
