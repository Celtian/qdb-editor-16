import { Component, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface RenameProjectData {
  name: string;
}

export interface RenameProjectValue {
  name: string;
}

@Component({
  selector: 'app-rename-project-dialog',
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './rename-project-dialog.html',
  styleUrl: './rename-project-dialog.css',
})
export class RenameProjectDialog {
  private readonly data = inject<RenameProjectData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RenameProjectDialog, RenameProjectValue>);
  protected readonly model = signal<RenameProjectValue>({ name: this.data.name });
  protected readonly renameForm = form(this.model, (path) => {
    required(path.name, { message: 'Project name is required.' });
    maxLength(path.name, 80, { message: 'Use at most 80 characters.' });
  });

  protected save(): void {
    void submit(this.renameForm, async () => {
      await Promise.resolve();
      this.dialogRef.close({ name: this.model().name.trim() });
    });
  }
}
