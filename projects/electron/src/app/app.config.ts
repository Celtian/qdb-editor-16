import {
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideNullable } from 'ngx-nullable';
import { UI_LOCALE } from '../../shared/downloader/ui-format';
import { uiPaginatorIntlFactory } from './shared/ui-paginator';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    provideNullable(),
    { provide: LOCALE_ID, useValue: UI_LOCALE },
    { provide: MAT_DATE_LOCALE, useValue: UI_LOCALE },
    { provide: MatPaginatorIntl, useFactory: uiPaginatorIntlFactory },
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
  ],
};
