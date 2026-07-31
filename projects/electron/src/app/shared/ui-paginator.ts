import { MatPaginatorIntl } from '@angular/material/paginator';
import { formatUiNumber } from '../../../shared/downloader/ui-format';

export function uiPaginatorIntlFactory(): MatPaginatorIntl {
  const paginator = new MatPaginatorIntl();
  paginator.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) return `0 of ${formatUiNumber(length)}`;

    const normalizedLength = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex =
      startIndex < normalizedLength
        ? Math.min(startIndex + pageSize, normalizedLength)
        : startIndex + pageSize;
    return `${formatUiNumber(startIndex + 1)} – ${formatUiNumber(endIndex)} of ${formatUiNumber(
      normalizedLength,
    )}`;
  };
  return paginator;
}
