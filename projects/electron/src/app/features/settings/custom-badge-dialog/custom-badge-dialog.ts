import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
  type CustomBadge,
  type CustomBadgeColor,
  customBadgeColors,
  customBadgeLimits,
} from '../../../../../shared/downloader/custom-badge';
import { CustomBadge as CustomBadgeView } from '../../../shared/custom-badge/custom-badge';

export interface CustomBadgeDialogData {
  badge?: CustomBadge;
}

export interface CustomBadgeDialogValue {
  name: string;
  description: string;
  color: CustomBadgeColor;
}

const colorLabels: Record<CustomBadgeColor, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
};

const colorSwatchClasses: Record<CustomBadgeColor, string> = {
  red: 'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-red',
  orange:
    'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-orange',
  yellow:
    'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-yellow',
  green:
    'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-green',
  teal: 'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-teal',
  blue: 'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-blue',
  purple:
    'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-purple',
  pink: 'inline-block size-4 shrink-0 rounded-full border border-badge-swatch-outline bg-badge-pink',
};

@Component({
  selector: 'app-custom-badge-dialog',
  imports: [
    CustomBadgeView,
    DecimalPipe,
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './custom-badge-dialog.html',
  styleUrl: './custom-badge-dialog.css',
})
export class CustomBadgeDialog {
  protected readonly data = inject<CustomBadgeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CustomBadgeDialog, CustomBadgeDialogValue>);
  protected readonly colors = customBadgeColors;
  protected readonly colorSwatchClasses = colorSwatchClasses;
  protected readonly limits = customBadgeLimits;
  protected readonly badgeModel = signal<CustomBadgeDialogValue>({
    name: this.data.badge?.name ?? '',
    description: this.data.badge?.description ?? '',
    color: this.data.badge?.color ?? 'blue',
  });
  protected readonly badgeForm = form(this.badgeModel, (path) => {
    required(path.name, { message: 'Enter a badge name.' });
    maxLength(path.name, customBadgeLimits.name.max, {
      message: `Use at most ${customBadgeLimits.name.max} characters.`,
    });
    required(path.description, { message: 'Enter a tooltip description.' });
    maxLength(path.description, customBadgeLimits.description.max, {
      message: `Use at most ${customBadgeLimits.description.max} characters.`,
    });
  });
  protected readonly previewBadge = computed<CustomBadge>(() => ({
    id: this.data.badge?.id ?? 'preview',
    name: this.badgeModel().name.trim() || 'Custom badge',
    description: this.badgeModel().description.trim() || 'Badge tooltip',
    color: this.badgeModel().color,
  }));

  protected colorLabel(color: CustomBadgeColor): string {
    return colorLabels[color];
  }

  protected save(): void {
    void submit(this.badgeForm, async () => {
      await Promise.resolve();
      const value = this.badgeModel();
      this.dialogRef.close({
        name: value.name.trim(),
        description: value.description.trim(),
        color: value.color,
      });
    });
  }
}
