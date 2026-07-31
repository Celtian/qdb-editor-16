import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';
import {
  defaultEntityStatusSettings,
  normalizeEntityStatusSettings,
  type EntityStatusSettings,
} from '../../../shared/downloader/entity-status';

export const ENTITY_STATUS_SETTINGS_STORAGE_KEY = 'qdb-downloader.entity-status-settings';

@Service()
export class EntityStatusSettingsService {
  private readonly document = inject(DOCUMENT);
  private readonly settingsState = signal<EntityStatusSettings>(this.loadSettings());
  readonly settings = this.settingsState.asReadonly();

  setSettings(settings: EntityStatusSettings): void {
    const normalized = normalizeEntityStatusSettings(settings);
    this.settingsState.set(normalized);
    this.saveSettings(normalized);
  }

  private loadSettings(): EntityStatusSettings {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(
        ENTITY_STATUS_SETTINGS_STORAGE_KEY,
      );
      return stored === null || stored === undefined
        ? { ...defaultEntityStatusSettings }
        : normalizeEntityStatusSettings(JSON.parse(stored) as unknown);
    } catch {
      return { ...defaultEntityStatusSettings };
    }
  }

  private saveSettings(settings: EntityStatusSettings): void {
    try {
      this.document.defaultView?.localStorage.setItem(
        ENTITY_STATUS_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    } catch {
      // Badge settings persistence is optional when local storage is unavailable.
    }
  }
}
