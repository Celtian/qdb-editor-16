import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import type { ThemePreference } from '../../../../shared/contracts';
import { Theme } from '../../core/theme';
import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-settings-page',
  imports: [MatCardModule, MatIconModule, MatRadioModule, PageHeader],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  protected readonly theme = inject(Theme);

  protected setTheme(value: ThemePreference): void {
    void this.theme.set(value);
  }
}
