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
    title: 'Edit FIFA 16 databases locally',
    summary:
      'QDB Editor 16 organizes independent FIFA 16 databases into dated projects and exposes every table published by fifatables.',
    sections: [
      {
        title: 'Local-first desktop editing',
        paragraphs: [
          'Projects, imported rows, validation reports, and settings remain in the application data directory on your computer.',
          'The Angular interface has no direct filesystem access. Import, SQLite, validation, and export operations pass through a narrow sandboxed Electron bridge.',
        ],
        bullets: [
          'Create projects with a name and reference date.',
          'Keep multiple blank or imported databases in each project.',
          'Browse and edit every supported FIFA 16 table.',
          'Validate and export DB Master-compatible text folders.',
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
    summary: 'A project gives multiple databases one reference date for readable FIFA date hints.',
    sections: [
      {
        title: 'Project library',
        paragraphs: [
          'Project names are unique. The reference date is stored as a calendar date and is used to calculate player ages without changing raw FIFA values.',
          'Deleting a project removes its managed SQLite databases but never removes original import folders or previous external exports.',
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
    summary: 'Search, sort, paginate, choose columns, edit inline, or open a complete row form.',
    sections: [
      {
        title: 'Explicit row saves',
        paragraphs: [
          'Inline and full-form changes remain drafts until Save is selected. Cancel discards the draft.',
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
          'A catalog SQLite database tracks project metadata while every FIFA database is stored in a separate managed SQLite file.',
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
