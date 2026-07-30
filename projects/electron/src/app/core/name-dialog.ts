import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface NameDialogData {
  title: string;
  label: string;
  value: string;
}

@Component({
  selector: 'app-name-dialog',
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="w-full pt-2">
        <mat-label>{{ data.label }}</mat-label>
        <input matInput [formField]="nameForm.name" />
        @if (nameForm.name().touched() && nameForm.name().errors().length) {
          <mat-error>{{ nameForm.name().errors()[0].message }}</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" matButton (click)="dialog.close()">Cancel</button>
      <button type="button" matButton="filled" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
})
export class NameDialog {
  protected readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);
  protected readonly dialog = inject(MatDialogRef<NameDialog, string>);
  private readonly model = signal({ name: this.data.value });
  protected readonly nameForm = form(this.model, (schema) => {
    required(schema.name, { message: 'Name is required.' });
    maxLength(schema.name, 80, { message: 'Use 80 characters or fewer.' });
  });

  protected save(): void {
    void submit(this.nameForm, async () => this.dialog.close(this.model().name.trim()));
  }
}
