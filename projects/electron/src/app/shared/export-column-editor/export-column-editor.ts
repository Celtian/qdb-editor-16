import { Component, input, model } from '@angular/core';
import {
  FormField,
  applyEach,
  disabled as disabledField,
  form,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';

import type {
  EntityKind,
  ExportColumnSelection,
  ExportFieldNameConfiguration,
} from '../../../../shared/downloader/contracts';
import {
  camelCaseExportFieldNames,
  defaultExportColumns,
  exportColumnDefinitions,
  validateExportFieldNames,
} from '../../../../shared/downloader/export-schema';

export type ExportColumnEditorMode = 'combined' | 'visibility' | 'fieldNames';

const entityKinds = ['leagues', 'teams', 'players'] as const satisfies readonly EntityKind[];

@Component({
  selector: 'app-export-column-editor',
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatTabsModule,
  ],
  templateUrl: './export-column-editor.html',
  styleUrl: './export-column-editor.css',
})
export class ExportColumnEditor {
  readonly selection = model<ExportColumnSelection>(defaultExportColumns());
  readonly fieldNames = model<ExportFieldNameConfiguration>(camelCaseExportFieldNames());
  readonly mode = input<ExportColumnEditorMode>('combined');
  readonly disabled = input(false);
  protected readonly entities = entityKinds;
  protected readonly columnDefinitions = exportColumnDefinitions;
  protected readonly entityLabels: Record<EntityKind, string> = {
    leagues: 'Leagues',
    teams: 'Teams',
    players: 'Players',
  };
  protected readonly fieldNamesForm = form(this.fieldNames, (path) => {
    applyEach(path.leagues, (mapping) => {
      disabledField(mapping.outputName, {
        when: (context) =>
          this.disabled() ||
          (this.mode() === 'combined' &&
            !this.isSelected('leagues', context.valueOf(mapping.sourceKey))),
      });
      validate(mapping.outputName, (context) =>
        this.validationError('leagues', context.valueOf(mapping.sourceKey)),
      );
    });
    applyEach(path.teams, (mapping) => {
      disabledField(mapping.outputName, {
        when: (context) =>
          this.disabled() ||
          (this.mode() === 'combined' &&
            !this.isSelected('teams', context.valueOf(mapping.sourceKey))),
      });
      validate(mapping.outputName, (context) =>
        this.validationError('teams', context.valueOf(mapping.sourceKey)),
      );
    });
    applyEach(path.players, (mapping) => {
      disabledField(mapping.outputName, {
        when: (context) =>
          this.disabled() ||
          (this.mode() === 'combined' &&
            !this.isSelected('players', context.valueOf(mapping.sourceKey))),
      });
      validate(mapping.outputName, (context) =>
        this.validationError('players', context.valueOf(mapping.sourceKey)),
      );
    });
  });

  protected showsVisibility(): boolean {
    return this.mode() !== 'fieldNames';
  }

  protected showsFieldNames(): boolean {
    return this.mode() !== 'visibility';
  }

  protected isSelected<Entity extends EntityKind>(
    entity: Entity,
    column: ExportColumnSelection[Entity][number],
  ): boolean {
    return (this.selection()[entity] as readonly string[]).includes(column);
  }

  protected isLastSelected<Entity extends EntityKind>(
    entity: Entity,
    column: ExportColumnSelection[Entity][number],
  ): boolean {
    return this.selection()[entity].length === 1 && this.isSelected(entity, column);
  }

  protected toggle<Entity extends EntityKind>(
    entity: Entity,
    sourceKey: ExportColumnSelection[Entity][number],
    selected: boolean,
  ): void {
    const selectedKeys = new Set(this.selection()[entity] as readonly string[]);
    if (selected) selectedKeys.add(sourceKey);
    else selectedKeys.delete(sourceKey);
    const next = exportColumnDefinitions[entity]
      .filter(({ key }) => selectedKeys.has(key))
      .map(({ key }) => key);
    this.selection.update((current) => ({ ...current, [entity]: next }));
  }

  protected selectAll(entity: EntityKind): void {
    this.selection.update((current) => ({
      ...current,
      [entity]: exportColumnDefinitions[entity].map(({ key }) => key),
    }));
  }

  protected fieldNameIndex(entity: EntityKind, sourceKey: string): number {
    return this.fieldNames()[entity].findIndex((mapping) => mapping.sourceKey === sourceKey);
  }

  private validationError(entity: EntityKind, sourceKey: string) {
    const error = validateExportFieldNames(this.fieldNames()).find(
      (candidate) => candidate.entity === entity && candidate.sourceKey === sourceKey,
    );
    return error ? { kind: error.kind, message: error.message } : undefined;
  }
}
