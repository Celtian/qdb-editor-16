import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';
import { formatReferenceDate } from '../../../shared/downloader/reference-date';

@Pipe({
  name: 'referenceDate',
})
export class ReferenceDatePipe implements PipeTransform {
  transform(value: string): string {
    return formatReferenceDate(value);
  }
}
