export interface DocumentationPage {
  path: string;
  label: string;
  icon: string;
  title: string;
  summary: string;
  sections: { title: string; paragraphs: string[]; bullets?: string[] }[];
}

export const documentationPages: DocumentationPage[] = [
  {
    path: '',
    label: 'Overview',
    icon: 'home',
    title: 'Build and edit football databases locally',
    summary:
      'QDB Editor 16 brings provider snapshots, canonical combined data, and independent FIFA 16 databases into one dated project.',
    sections: [
      {
        title: 'Local-first desktop editing',
        paragraphs: [
          'Projects, imported rows, validation reports, and settings remain in the application data directory on your computer.',
          'The Angular interface has no direct filesystem access. Import, SQLite, validation, and export operations pass through a narrow sandboxed Electron bridge.',
        ],
        bullets: [
          'Create projects with a name and reference date.',
          'Import provider records into Source DB and resolve them into Combined DB.',
          'Keep multiple blank or imported FIFA databases in each project.',
          'Browse and edit every supported FIFA 16 table.',
          'Use object views for countries, stadiums, leagues, teams, players, and referees.',
          'Validate and export DB Master-compatible text folders.',
        ],
      },
    ],
  },
  {
    path: 'source-db',
    label: 'Source DB',
    icon: 'cloud_download',
    title: 'Import and maintain provider data',
    summary:
      'Preview and import Transfermarkt, Soccerway, WorldFootball, or Eurofotbal records without losing provider provenance.',
    sections: [
      {
        title: 'Provider snapshots',
        paragraphs: [
          'Import a league or team, choose included squads and players, review changes and conflicts, then commit the complete operation transactionally.',
          'Merge and synchronize policies control existing records, team-to-league conflicts, and player-to-team conflicts. Long-running scraping can be canceled.',
        ],
        bullets: [
          'Search, sort, paginate, and filter leagues, teams, and players.',
          'Edit source metadata or refresh a record from its provider.',
          'Apply countries, league tiers, and custom badges in bulk.',
          'Preview the impact of cleanup and deletion before changing linked data.',
        ],
      },
    ],
  },
  {
    path: 'combined-db',
    label: 'Combined DB',
    icon: 'merge',
    title: 'Resolve canonical football data',
    summary:
      'Group records from multiple providers, select canonical values, and retain links back to every source.',
    sections: [
      {
        title: 'Matching and review',
        paragraphs: [
          'The import workflow uses source priority and normalized matching to group teams and players. Conflicting fields stay explicit until you resolve them.',
          'Combined records keep provider provenance, review status, reusable badges, filtering, bulk actions, and safe re-combination.',
        ],
      },
    ],
  },
  {
    path: 'objects',
    label: 'Object views',
    icon: 'category',
    title: 'Edit connected FIFA objects',
    summary:
      'Work with recognizable football objects while QDB Editor updates the same managed SQLite tables.',
    sections: [
      {
        title: 'Tables and objects stay synchronized',
        paragraphs: [
          'Object views join related FIFA tables into searchable lists and focused detail sections. Changes made through an object view immediately appear in Tables, validation, and exports.',
          'Multi-table changes are transactional. If validation or a relationship update fails, the complete object save is rolled back.',
        ],
        bullets: [
          'Countries, leagues, teams, and referees support root create, edit, and dependency-safe delete actions.',
          'Existing players can be edited through identity, contract, appearance, gear, traits, skills, and behaviour sections.',
          'Stadiums remain read-only, matching the implemented Quick Editor feature set.',
          'Object generation settings are stored per database and are not exported into FIFA tables.',
        ],
      },
    ],
  },
  {
    path: 'installation',
    label: 'Installation',
    icon: 'download',
    title: 'Install QDB Editor 16',
    summary: 'Use the Windows installer or the portable x64 ZIP from GitHub Releases.',
    sections: [
      {
        title: 'Windows',
        paragraphs: [
          'Download QDB-Editor-16-Setup.exe for a normal installation, or extract the portable ZIP completely before running the executable.',
          'Releases are currently unsigned. Verify the GitHub release URL and its SHA-256 sidecar before accepting a Windows SmartScreen warning.',
        ],
      },
    ],
  },
  {
    path: 'projects',
    label: 'Projects',
    icon: 'folder_copy',
    title: 'Projects and reference dates',
    summary:
      'A project gives Source, Combined, and all FIFA databases one authoritative reference date.',
    sections: [
      {
        title: 'Project library',
        paragraphs: [
          'Project names are unique. The reference date is stored as a calendar date and is used to calculate player ages without changing raw FIFA values.',
          'Deleting a project cascades Source and Combined records, removes managed FIFA files, and reports export folders that could not be cleaned up.',
        ],
      },
    ],
  },
  {
    path: 'downloader-migration',
    label: 'Downloader migration',
    icon: 'move_down',
    title: 'Migrate QDB Downloader data',
    summary:
      'Preview and transactionally copy a standalone QDB Downloader v0.0.22 library into the unified catalog.',
    sections: [
      {
        title: 'Non-destructive migration',
        paragraphs: [
          'Settings detects the platform-default legacy database and also provides a file picker. The preview shows records, exact project merges, and projects that will be created.',
          'Projects merge only when normalized names and reference dates match. Other name conflicts receive a “(Downloader)” suffix. The legacy file is opened read-only and remains unchanged.',
        ],
        bullets: [
          'Source and Combined entities, relationships, badges, and downloader preferences are copied.',
          'Identifier collisions are remapped.',
          'A failure rolls back the complete catalog transaction and permits retry.',
          'Successful source-file identities are remembered so the same migration is not offered repeatedly.',
        ],
      },
    ],
  },
  {
    path: 'importing',
    label: 'Importing',
    icon: 'upload_file',
    title: 'Import FIFA 16 sources',
    summary: 'Import DB Master text folders or paired PC t3db database and metadata files.',
    sections: [
      {
        title: 'Supported sources',
        paragraphs: [
          'Text files must be UTF-16LE with a byte-order mark, tab-separated columns, and FIFA 16 headers.',
          'For t3db, select both the .db file and its matching metadata XML. The source is inspected before any managed database is installed.',
        ],
        bullets: [
          'Missing supported tables become empty managed tables.',
          'Unsupported source tables are reported and ignored.',
          'Invalid values are preserved and listed in the validation report for repair.',
        ],
      },
    ],
  },
  {
    path: 'editing',
    label: 'Editing',
    icon: 'edit_note',
    title: 'Browse and edit tables',
    summary: 'Search, sort, paginate, choose columns, or edit through a complete row form.',
    sections: [
      {
        title: 'Explicit row saves',
        paragraphs: [
          'Changes in the row editor remain drafts until Save is selected. Cancel discards the draft.',
          'Invalid numeric or duplicate unique values are blocked. Values outside published fifatables ranges require explicit confirmation.',
        ],
        bullets: [
          'FIFA dates are shown as readable dates alongside their raw values.',
          'Player birthdates include age at the project reference date.',
          'Player rows show a read-only FIFA 16 calculated rating comparison.',
        ],
      },
    ],
  },
  {
    path: 'validation',
    label: 'Validation',
    icon: 'fact_check',
    title: 'Understand validation reports',
    summary: 'Review value, uniqueness, range, and table relationship issues before exporting.',
    sections: [
      {
        title: 'Errors and warnings',
        paragraphs: [
          'Errors identify invalid integers, invalid numbers, and duplicate fields marked unique by fifatables.',
          'Warnings identify published range exceptions and declared references that do not resolve to another managed row.',
        ],
      },
    ],
  },
  {
    path: 'exporting',
    label: 'Exporting',
    icon: 'drive_file_move',
    title: 'Export all FIFA 16 tables',
    summary:
      'Create a deterministic DB Master-compatible text folder without overwriting older exports.',
    sections: [
      {
        title: 'Export format',
        paragraphs: [
          'Every supported table is written in fifatables field order. Empty tables contain a complete header with no data rows.',
          'Files use UTF-16LE BOM, tab separators, CRLF line endings, and DB Master-compatible quoting.',
        ],
      },
    ],
  },
  {
    path: 'storage',
    label: 'Storage & privacy',
    icon: 'security',
    title: 'Managed storage and privacy',
    summary: 'QDB Editor 16 works locally and does not upload FIFA data.',
    sections: [
      {
        title: 'Safe boundaries',
        paragraphs: [
          'The catalog SQLite database stores projects, Source and Combined records, badges, downloader preferences, and FIFA database metadata. Every FIFA database is stored in a separate managed SQLite file.',
          'Imports are copied into temporary managed databases and atomically installed. Exports are created in new timestamped folders.',
        ],
      },
    ],
  },
  {
    path: 'troubleshooting',
    label: 'Troubleshooting',
    icon: 'build',
    title: 'Troubleshooting',
    summary: 'Resolve common source, validation, and export problems.',
    sections: [
      {
        title: 'Common checks',
        paragraphs: [],
        bullets: [
          'Confirm that text files include a UTF-16LE byte-order mark.',
          'Select FIFA 16 data rather than a different FIFA edition.',
          'Pair a t3db database with the metadata XML that describes it.',
          'Repair validation errors before using an export in FIFA or DB Master.',
          'Choose a writable parent directory for exports.',
        ],
      },
    ],
  },
  {
    path: 'releases',
    label: 'Releases',
    icon: 'new_releases',
    title: 'Releases and updates',
    summary: 'Stable version tags publish Windows artifacts, checksums, and this documentation.',
    sections: [
      {
        title: 'Update safety',
        paragraphs: [
          'Packaged installations check GitHub Releases for newer versions. Release artifacts include SHA-256 sidecars for verification.',
        ],
      },
    ],
  },
];
