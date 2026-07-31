import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import type { ErrorStateMatcher } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import type { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { isReferenceDate } from '../../../../../shared/downloader/reference-date';

@Component({
  selector: 'app-create-project-dialog',
  imports: [
    FormField,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './create-project-dialog.html',
  styleUrl: './create-project-dialog.css',
})
export class CreateProjectDialog {
  private readonly dialogRef = inject(MatDialogRef<CreateProjectDialog, CreateProjectValue>);
  protected readonly model = signal<CreateProjectValue>({ name: '', referenceDate: '' });
  protected readonly projectForm = form(this.model, (path) => {
    required(path.name, { message: 'Project name is required.' });
    maxLength(path.name, 80, { message: 'Use at most 80 characters.' });
    required(path.referenceDate, { message: 'Reference date is required.' });
    validate(path.referenceDate, ({ value }) =>
      !value() || isReferenceDate(value())
        ? undefined
        : { kind: 'reference-date', message: 'Enter a valid calendar date.' },
    );
  });
  protected readonly selectedReferenceDate = computed(() =>
    fromReferenceDate(this.model().referenceDate),
  );
  protected readonly referenceDateFilter = (date: Date | null): boolean =>
    date !== null && date.getFullYear() >= 1900 && date.getFullYear() <= 9999;
  protected readonly referenceDateErrorStateMatcher: ErrorStateMatcher = {
    isErrorState: () =>
      this.projectForm.referenceDate().touched() && this.projectForm.referenceDate().invalid(),
  };

  protected setReferenceDate(event: MatDatepickerInputEvent<Date>): void {
    const date = event.value;
    this.model.update((value) => ({
      ...value,
      referenceDate: date ? toReferenceDate(date) : '',
    }));
    this.projectForm.referenceDate().markAsDirty();
    this.projectForm.referenceDate().markAsTouched();
  }

  protected touchReferenceDate(): void {
    this.projectForm.referenceDate().markAsTouched();
  }

  protected clearReferenceDate(): void {
    this.model.update((value) => ({ ...value, referenceDate: '' }));
    this.projectForm.referenceDate().markAsDirty();
    this.projectForm.referenceDate().markAsTouched();
  }

  protected save(): void {
    void submit(this.projectForm, () => {
      this.dialogRef.close({
        name: this.model().name.trim(),
        referenceDate: this.model().referenceDate,
      });
      return Promise.resolve();
    });
  }
}

export interface CreateProjectValue {
  name: string;
  referenceDate: string;
}

const toReferenceDate = (date: Date): string => {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromReferenceDate = (value: string): Date | null => {
  if (!isReferenceDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
