import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_STORAGE_KEY = 'qdb-downloader.theme';

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preferenceState = signal<ThemePreference>(this.loadPreference());
  readonly preference = this.preferenceState.asReadonly();

  constructor() {
    this.applyPreference(this.preferenceState());
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    this.applyPreference(preference);
    this.savePreference(preference);
  }

  private loadPreference(): ThemePreference {
    try {
      const preference = this.document.defaultView?.localStorage.getItem(
        THEME_PREFERENCE_STORAGE_KEY,
      );
      return isThemePreference(preference) ? preference : 'system';
    } catch {
      return 'system';
    }
  }

  private savePreference(preference: ThemePreference): void {
    try {
      this.document.defaultView?.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
    } catch {
      // Theme persistence is optional when local storage is unavailable.
    }
  }

  private applyPreference(preference: ThemePreference): void {
    this.document.documentElement.style.colorScheme =
      preference === 'system' ? 'light dark' : preference;
  }
}
