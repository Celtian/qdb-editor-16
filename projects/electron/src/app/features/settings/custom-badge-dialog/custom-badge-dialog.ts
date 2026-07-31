import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  customBadgeColors,
  customBadgeLimits,
  type CustomBadge,
  type CustomBadgeColor,
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
  template: `
    <h2 mat-dialog-title>{{ data.badge ? 'Edit custom badge' : 'Create custom badge' }}</h2>
    <mat-dialog-content>
      <form id="custom-badge-form" (submit)="$event.preventDefault(); save()">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput autocomplete="off" [formField]="badgeForm.name" />
          <mat-hint align="end">
            {{ badgeModel().name.length | number }}/{{ limits.name.max | number }}
          </mat-hint>
          @if (badgeForm.name().touched() && badgeForm.name().invalid()) {
            <mat-error>{{ badgeForm.name().errors()[0]?.message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Tooltip description</mat-label>
          <textarea matInput rows="3" [formField]="badgeForm.description"></textarea>
          <mat-hint align="end">
            {{ badgeModel().description.length | number }}/{{ limits.description.max | number }}
          </mat-hint>
          @if (badgeForm.description().touched() && badgeForm.description().invalid()) {
            <mat-error>{{ badgeForm.description().errors()[0]?.message }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Color</mat-label>
          <mat-select [formField]="badgeForm.color">
            <mat-select-trigger>
              <span class="color-option color-select-trigger">
                <span
                  aria-hidden="true"
                  [class]="'color-swatch color-swatch--' + badgeModel().color"
                ></span>
                <span>{{ colorLabel(badgeModel().color) }}</span>
              </span>
            </mat-select-trigger>
            @for (color of colors; track color) {
              <mat-option [value]="color">
                <span class="color-option">
                  <span aria-hidden="true" [class]="'color-swatch color-swatch--' + color"></span>
                  <span>{{ colorLabel(color) }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="preview" aria-live="polite">
          <span>Preview</span>
          <app-custom-badge [badge]="previewBadge()" />
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button
        matButton="filled"
        form="custom-badge-form"
        type="submit"
        [disabled]="badgeForm().invalid()"
      >
        {{ data.badge ? 'Save changes' : 'Create badge' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    form {
      display: grid;
      gap: 0.75rem;
      min-width: min(28rem, 75vw);
      padding-top: 0.5rem;
    }
    mat-form-field {
      width: 100%;
    }
    .color-option {
      align-items: center;
      display: inline-flex;
      gap: 0.5rem;
    }
    .color-swatch {
      border: 1px solid color-mix(in srgb, var(--mat-sys-on-surface) 24%, transparent);
      border-radius: 50%;
      box-sizing: border-box;
      display: inline-block;
      flex: 0 0 auto;
      height: 1rem;
      width: 1rem;
    }
    .color-swatch--red {
      background: #ffdad6;
    }
    .color-swatch--orange {
      background: #ffdcc2;
    }
    .color-swatch--yellow {
      background: #fbe59a;
    }
    .color-swatch--green {
      background: #b7f1c2;
    }
    .color-swatch--teal {
      background: #9cf1df;
    }
    .color-swatch--blue {
      background: #d6e3ff;
    }
    .color-swatch--purple {
      background: #e9ddff;
    }
    .color-swatch--pink {
      background: #ffd8e4;
    }
    .preview {
      align-items: center;
      color: var(--mat-sys-on-surface-variant);
      display: flex;
      gap: 0.75rem;
    }
  `,
})
export class CustomBadgeDialog {
  protected readonly data = inject<CustomBadgeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CustomBadgeDialog, CustomBadgeDialogValue>);
  protected readonly colors = customBadgeColors;
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
