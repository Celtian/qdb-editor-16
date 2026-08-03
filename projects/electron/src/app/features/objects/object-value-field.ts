import { Component, effect, input, output, signal } from '@angular/core';
import { FormField, form, max, min, required } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import type { FieldDescriptor, TableValue } from '../../../../shared/contracts';

@Component({
  selector: 'app-object-value-field',
  imports: [FormField, MatFormFieldModule, MatInputModule],
  templateUrl: './object-value-field.html',
  host: { class: 'contents' },
})
export class ObjectValueField {
  readonly field = input.required<FieldDescriptor>();
  readonly label = input<string>();
  readonly value = input.required<TableValue>();
  readonly valueChange = output<TableValue>();
  protected readonly textModel = signal({ value: '' });
  protected readonly numberModel = signal<{ value: number | null }>({ value: 0 });
  protected readonly textForm = form(this.textModel, (schema) => {
    required(schema.value, { message: 'A value is required.' });
  });
  protected readonly numberForm = form(this.numberModel, (schema) => {
    required(schema.value, { message: 'A value is required.' });
    min(schema.value, () => this.field().range?.min);
    max(schema.value, () => this.field().range?.max);
  });
  protected readonly displayLabel = () =>
    this.label() ??
    this.field()
      .name.replaceAll('_', ' ')
      .replace(/(^|\s)\S/g, (value) => value.toLocaleUpperCase('en'));

  constructor() {
    effect(() => {
      const value = this.value();
      if (this.field().type === 'string') this.textModel.set({ value: String(value) });
      else this.numberModel.set({ value: typeof value === 'number' ? value : Number(value) });
    });
    effect(() => {
      if (this.field().type === 'string') this.valueChange.emit(this.textModel().value);
      else this.valueChange.emit(this.numberModel().value ?? '');
    });
  }
}
