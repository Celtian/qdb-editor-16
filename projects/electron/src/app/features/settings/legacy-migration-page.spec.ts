import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { AppStore } from '../../core/app-store';
import { DesktopApi } from '../../core/desktop-api';
import { LegacyMigrationPage } from './legacy-migration-page';

describe('LegacyMigrationPage', () => {
  it('shows a non-destructive preview and completes migration accessibly', async () => {
    const preview = {
      sourcePath: '/legacy/qdb-downloader.sqlite',
      sourceIdentity: 'legacy-identity',
      alreadyMigrated: false,
      projects: [
        {
          legacyProjectId: 'legacy-project',
          name: 'Career',
          referenceDate: '2026-07-01',
          action: 'merge' as const,
          targetProjectId: 'project',
          targetName: 'Career',
          counts: {
            leagues: 1,
            teams: 20,
            players: 500,
            combinedLeagues: 1,
            combinedTeams: 20,
            combinedPlayers: 450,
          },
        },
      ],
      totals: {
        leagues: 1,
        teams: 20,
        players: 500,
        combinedLeagues: 1,
        combinedTeams: 20,
        combinedPlayers: 450,
      },
    };
    const api = {
      detectLegacyDownloaderDatabase: vi.fn(() => Promise.resolve(preview.sourcePath)),
      selectLegacyDownloaderDatabase: vi.fn(() => Promise.resolve(undefined)),
      previewLegacyDownloaderMigration: vi.fn(() => Promise.resolve(preview)),
      migrateLegacyDownloader: vi.fn(() =>
        Promise.resolve({
          sourceIdentity: preview.sourceIdentity,
          projectsMerged: 1,
          projectsCreated: 0,
          totals: preview.totals,
        }),
      ),
    };
    const store = { refreshProjects: vi.fn(() => Promise.resolve()) };
    await TestBed.configureTestingModule({
      imports: [LegacyMigrationPage],
      providers: [
        provideRouter([]),
        { provide: DesktopApi, useValue: api },
        { provide: AppStore, useValue: store },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LegacyMigrationPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Merge into Career');
    expect(element.textContent).toContain('1 / 20 / 500');
    expect(element.textContent).toContain('The selected SQLite file is always opened read-only.');
    expect((await axe.run(element)).violations).toEqual([]);

    const migrate = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent.includes('Migrate projects'),
    );
    migrate?.click();
    await fixture.whenStable();

    expect(api.migrateLegacyDownloader).toHaveBeenCalledWith({
      sourcePath: preview.sourcePath,
      sourceIdentity: preview.sourceIdentity,
    });
    expect(store.refreshProjects).toHaveBeenCalledOnce();
    expect(element.textContent).toContain('Migration completed: 0 projects created and 1 merged.');
  });
});
