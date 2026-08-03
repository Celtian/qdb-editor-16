import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';

import { map } from 'rxjs';

import { AppNavigation } from './core/app-navigation';
import { AppStore } from './core/app-store';
import { Theme } from './core/theme';

@Component({
  selector: 'app-root',
  imports: [
    AppNavigation,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterOutlet,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(AppStore);
  private readonly theme = inject(Theme);
  private readonly breakpoints = inject(BreakpointObserver);
  protected readonly compact = toSignal(
    this.breakpoints.observe('(max-width: 800px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    void this.theme.initialize();
    void this.store.refreshProjects();
  }
}
