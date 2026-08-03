import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import type {
  ExportColumnSelection,
  ExportFieldNameConfiguration,
} from '../../../../../shared/downloader/contracts';
import {
  camelCaseExportFieldNames,
  cloneExportColumns,
  cloneExportFieldNames,
  defaultExportColumns,
  validateExportColumns,
  validateExportFieldNames,
} from '../../../../../shared/downloader/export-schema';
import {
  ExportColumnPresetsService,
  type ExportFieldNamePreset,
  type ExportVisibilityPreset,
  camelCaseExportFieldNamePresetId,
  defaultExportVisibilityPresetId,
} from '../../../core/export-column-presets.service';
import { ExportColumnEditor } from '../../../shared/export-column-editor/export-column-editor';
import { PageHeader } from '../../../shared/page-header/page-header';

const newVisibilityPresetId = 'new-visibility';
const newFieldNamePresetId = 'new-field-names';

@Component({
  selector: 'app-export-settings-page',
  imports: [
    ExportColumnEditor,
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
  ],
  templateUrl: './export-settings-page.html',
  styleUrl: './export-settings-page.css',
})
export class ExportSettingsPage {
  private readonly exportPresets = inject(ExportColumnPresetsService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly loading = this.exportPresets.loading;
  protected readonly presetError = this.exportPresets.error;
  protected readonly visibilityPresets = this.exportPresets.visibilityPresets;
  protected readonly fieldNamePresets = this.exportPresets.fieldNamePresets;

  protected readonly selectedVisibilityPresetId = signal(defaultExportVisibilityPresetId);
  protected readonly selectedVisibilityPreset = computed<ExportVisibilityPreset | undefined>(() =>
    this.visibilityPresets().find((preset) => preset.id === this.selectedVisibilityPresetId()),
  );
  protected readonly creatingVisibilityPreset = computed(
    () => this.selectedVisibilityPresetId() === newVisibilityPresetId,
  );
  protected readonly visibilityPresetIsBuiltIn = computed(
    () => this.selectedVisibilityPreset()?.builtIn ?? false,
  );
  protected readonly visibilityNameModel = signal({ name: 'Default' });
  protected readonly visibilityNameForm = form(this.visibilityNameModel, (path) => {
    required(path.name, { message: 'Enter a preset name.' });
    maxLength(path.name, 60, { message: 'Use 60 characters or fewer.' });
    validate(path.name, ({ value }) => {
      const name = value().trim();
      return name && this.exportPresets.hasVisibilityName(name, this.selectedVisibilityPresetId())
        ? { kind: 'duplicate', message: 'Visibility preset names must be unique.' }
        : undefined;
    });
  });
  protected readonly exportColumns = signal<ExportColumnSelection>(defaultExportColumns());
  protected readonly exportColumnsValid = computed(
    () => validateExportColumns(this.exportColumns()).length === 0,
  );

  protected readonly selectedFieldNamePresetId = signal(camelCaseExportFieldNamePresetId);
  protected readonly selectedFieldNamePreset = computed<ExportFieldNamePreset | undefined>(() =>
    this.fieldNamePresets().find((preset) => preset.id === this.selectedFieldNamePresetId()),
  );
  protected readonly creatingFieldNamePreset = computed(
    () => this.selectedFieldNamePresetId() === newFieldNamePresetId,
  );
  protected readonly fieldNamePresetIsBuiltIn = computed(
    () => this.selectedFieldNamePreset()?.builtIn ?? false,
  );
  protected readonly fieldNameModel = signal({ name: 'Camel case' });
  protected readonly fieldNameForm = form(this.fieldNameModel, (path) => {
    required(path.name, { message: 'Enter a preset name.' });
    maxLength(path.name, 60, { message: 'Use 60 characters or fewer.' });
    validate(path.name, ({ value }) => {
      const name = value().trim();
      return name && this.exportPresets.hasFieldNameName(name, this.selectedFieldNamePresetId())
        ? { kind: 'duplicate', message: 'Field-name preset names must be unique.' }
        : undefined;
    });
  });
  protected readonly exportFieldNames = signal<ExportFieldNameConfiguration>(
    camelCaseExportFieldNames(),
  );
  protected readonly exportFieldNamesValid = computed(
    () => validateExportFieldNames(this.exportFieldNames()).length === 0,
  );

  protected selectVisibilityPreset(value: unknown): void {
    if (typeof value !== 'string') return;
    const preset = this.visibilityPresets().find((candidate) => candidate.id === value);
    if (!preset) return;
    this.visibilityNameForm().reset();
    this.selectedVisibilityPresetId.set(preset.id);
    this.visibilityNameModel.set({ name: preset.name });
    this.exportColumns.set(cloneExportColumns(preset.columns));
  }

  protected startNewVisibilityPreset(): void {
    const source = this.selectedVisibilityPreset()?.columns ?? defaultExportColumns();
    this.visibilityNameForm().reset();
    this.selectedVisibilityPresetId.set(newVisibilityPresetId);
    this.visibilityNameModel.set({ name: '' });
    this.exportColumns.set(cloneExportColumns(source));
  }

  protected saveVisibilityPreset(): void {
    if (!this.exportColumnsValid()) return;
    void submit(this.visibilityNameForm, async () => {
      const name = this.visibilityNameModel().name;
      if (this.creatingVisibilityPreset()) {
        const preset = await this.exportPresets.createVisibility(name, this.exportColumns());
        if (!preset) return this.showSaveError('Visibility');
        this.selectVisibilityPreset(preset.id);
        this.showSuccess(`${preset.name} visibility preset created.`);
        return;
      }
      const preset = this.selectedVisibilityPreset();
      if (
        !preset ||
        preset.builtIn ||
        !(await this.exportPresets.updateVisibility(preset.id, name, this.exportColumns()))
      ) {
        if (preset && !preset.builtIn) this.showSaveError('Visibility');
        return;
      }
      this.selectVisibilityPreset(preset.id);
      this.showSuccess(`${name.trim()} visibility preset saved.`);
    });
  }

  protected async deleteVisibilityPreset(): Promise<void> {
    const preset = this.selectedVisibilityPreset();
    if (!preset || preset.builtIn) return;
    if (!(await this.exportPresets.deleteVisibility(preset.id))) {
      this.showDeleteError('Visibility');
      return;
    }
    this.selectVisibilityPreset(defaultExportVisibilityPresetId);
    this.showSuccess(`${preset.name} visibility preset deleted.`);
  }

  protected selectFieldNamePreset(value: unknown): void {
    if (typeof value !== 'string') return;
    const preset = this.fieldNamePresets().find((candidate) => candidate.id === value);
    if (!preset) return;
    this.fieldNameForm().reset();
    this.selectedFieldNamePresetId.set(preset.id);
    this.fieldNameModel.set({ name: preset.name });
    this.exportFieldNames.set(cloneExportFieldNames(preset.fieldNames));
  }

  protected startNewFieldNamePreset(): void {
    const source = this.selectedFieldNamePreset()?.fieldNames ?? camelCaseExportFieldNames();
    this.fieldNameForm().reset();
    this.selectedFieldNamePresetId.set(newFieldNamePresetId);
    this.fieldNameModel.set({ name: '' });
    this.exportFieldNames.set(cloneExportFieldNames(source));
  }

  protected saveFieldNamePreset(): void {
    if (!this.exportFieldNamesValid()) return;
    void submit(this.fieldNameForm, async () => {
      const name = this.fieldNameModel().name;
      if (this.creatingFieldNamePreset()) {
        const preset = await this.exportPresets.createFieldNames(name, this.exportFieldNames());
        if (!preset) return this.showSaveError('Field-name');
        this.selectFieldNamePreset(preset.id);
        this.showSuccess(`${preset.name} field-name preset created.`);
        return;
      }
      const preset = this.selectedFieldNamePreset();
      if (
        !preset ||
        preset.builtIn ||
        !(await this.exportPresets.updateFieldNames(preset.id, name, this.exportFieldNames()))
      ) {
        if (preset && !preset.builtIn) this.showSaveError('Field-name');
        return;
      }
      this.selectFieldNamePreset(preset.id);
      this.showSuccess(`${name.trim()} field-name preset saved.`);
    });
  }

  protected async deleteFieldNamePreset(): Promise<void> {
    const preset = this.selectedFieldNamePreset();
    if (!preset || preset.builtIn) return;
    if (!(await this.exportPresets.deleteFieldNames(preset.id))) {
      this.showDeleteError('Field-name');
      return;
    }
    this.selectFieldNamePreset(camelCaseExportFieldNamePresetId);
    this.showSuccess(`${preset.name} field-name preset deleted.`);
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 3000 });
  }

  private showSaveError(kind: string): void {
    this.snackBar.open(
      `${kind} preset could not be saved. Check its name and try again.`,
      'Dismiss',
      {
        duration: 6000,
      },
    );
  }

  private showDeleteError(kind: string): void {
    this.snackBar.open(`${kind} preset could not be deleted.`, 'Dismiss', { duration: 6000 });
  }
}
