import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';

import type { ThemePreference } from '../../../shared/contracts';
import { DesktopApi } from './desktop-api';

@Service()
export class Theme {
  private readonly desktop = inject(DesktopApi);
  private readonly document = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>('system');

  async initialize(): Promise<void> {
    try {
      this.apply(await this.desktop.getTheme());
    } catch {
      this.apply('system');
    }
  }

  async set(value: ThemePreference): Promise<void> {
    this.apply(await this.desktop.setTheme(value));
  }

  private apply(value: ThemePreference): void {
    this.preference.set(value);
    if (value === 'system') this.document.documentElement.removeAttribute('data-theme');
    else this.document.documentElement.dataset['theme'] = value;
  }
}
