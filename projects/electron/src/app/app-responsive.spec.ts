import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSidenavHarness } from '@angular/material/sidenav/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { AppStore } from './core/app-store';
import { DesktopApi } from './core/desktop-api';
import { Theme } from './core/theme';

describe('responsive application shell', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('uses an overlay navigation drawer below 800px', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        AppStore,
        Theme,
        {
          provide: DesktopApi,
          useValue: {
            onProgress: () => () => undefined,
            listProjects: vi.fn(async () => []),
            getTheme: vi.fn(async () => 'system'),
          },
        },
        {
          provide: BreakpointObserver,
          useValue: {
            observe: () => of({ matches: true, breakpoints: { '(max-width: 800px)': true } }),
          },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const sidenav = await loader.getHarness(MatSidenavHarness);
    expect(await sidenav.getMode()).toBe('over');
    expect(await sidenav.isOpen()).toBe(false);
    expect(
      await loader.getHarnessOrNull(
        MatButtonHarness.with({ selector: 'button[aria-label="Collapse navigation"]' }),
      ),
    ).toBeNull();
    await (
      await loader.getHarness(
        MatButtonHarness.with({ selector: 'button[aria-label="Open navigation"]' }),
      )
    ).click();
    expect(await sidenav.isOpen()).toBe(true);
  });

  it('keeps the desktop navigation open at its fixed width without a rail control', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        AppStore,
        Theme,
        {
          provide: DesktopApi,
          useValue: {
            onProgress: () => () => undefined,
            listProjects: vi.fn(async () => []),
            getTheme: vi.fn(async () => 'system'),
          },
        },
        {
          provide: BreakpointObserver,
          useValue: {
            observe: () => of({ matches: false, breakpoints: { '(max-width: 800px)': false } }),
          },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const sidenav = await loader.getHarness(MatSidenavHarness);

    expect(await sidenav.getMode()).toBe('side');
    expect(await sidenav.isOpen()).toBe(true);
    expect(
      await loader.getHarnessOrNull(
        MatButtonHarness.with({ selector: 'button[aria-label="Collapse navigation"]' }),
      ),
    ).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('mat-sidenav')?.classList,
    ).not.toContain('navigation-rail');
  });
});
