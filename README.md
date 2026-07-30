<div align="center">

# ⚽ QDB Editor 16

**A secure, local-first FIFA 16 database editor for Windows.**

[![Release](https://github.com/Celtian/qdb-editor-16/actions/workflows/main.yml/badge.svg)](https://github.com/Celtian/qdb-editor-16/actions/workflows/main.yml)
[![Pull request](https://github.com/Celtian/qdb-editor-16/actions/workflows/pull-request.yml/badge.svg)](https://github.com/Celtian/qdb-editor-16/actions/workflows/pull-request.yml)

[Documentation](https://celtian.github.io/qdb-editor-16/) · [Releases](https://github.com/Celtian/qdb-editor-16/releases) · [Changelog](CHANGELOG.md) · [Source](https://github.com/Celtian/qdb-editor-16)

</div>

QDB Editor 16 organizes work into projects. Each project has a reference date and may contain
multiple independently named FIFA 16 databases. Databases can start blank or be imported from a DB
Master text folder or paired PC t3db `.db` and `.xml` files.

## Features

- Create, rename, and remove projects and their managed FIFA 16 databases.
- Import DB Master-compatible UTF-16LE text folders and paired PC t3db sources.
- Initialize all FIFA 16 tables exposed by `fifatables`, including tables missing from a source.
- Browse, search, sort, paginate, and configure visible columns in every supported table.
- Add, edit, and delete rows through inline editing or a responsive full-row form.
- Validate field types, uniqueness, published ranges, and declared cross-table relationships.
- Preserve invalid imported values so they can be reviewed and repaired.
- Show readable FIFA date and reference-date age hints without replacing stored values.
- Compare the calculated FIFA 16 player rating with the stored `overallrating`.
- Export every supported table in deterministic DB Master text format, including empty tables.
- Follow the system theme or use a persistent light or dark appearance.

## Architecture

- `projects/electron/src` — standalone, zoneless Angular renderer.
- `projects/electron/electron` — Electron main/preload code, SQLite services, and worker operations.
- `projects/electron/shared` — serializable IPC contracts and trusted FIFA 16 table configuration.
- `projects/docs` — statically prerendered Angular documentation for GitHub Pages.
- `tools` — Node-runtime test configuration and development tooling.

The renderer is sandboxed with context isolation and has no Node.js access. A narrow typed preload
API delegates filesystem and SQLite work to Electron. Imports, exports, and full validation run in
worker threads.

The catalog database is stored below Electron's `userData` directory. Each FIFA database is a
separate SQLite file below its project directory. Original imports and external export folders are
never modified by project or database deletion.

## Getting started

Requirements:

- [Bun](https://bun.sh/) 1.3.14.
- Node.js 24.18 or newer, but earlier than Node.js 25.

```sh
bun install --frozen-lockfile
bun run start
```

Angular starts on `127.0.0.1:4200`, Electron main and preload code compile into `.electron`, and the
desktop application opens.

Run the documentation site separately:

```sh
bun run start:docs
```

## Checks and builds

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run build
bun run package:desktop
```

Pull requests validate and test the source, build both Angular applications, and package/verify
Windows x64. Stable `vMAJOR.MINOR.PATCH` tags pointing to `master` build Squirrel and ZIP artifacts,
publish SHA-256 sidecars and a GitHub Release, and deploy the documentation to `gh-pages`.

## Windows installation

Choose one release asset:

1. Download and run `QDB-Editor-16-Setup.exe`.
2. Or download the Windows x64 ZIP, extract it completely, and run `QDB Editor 16.exe`.

The application is currently unsigned. Windows SmartScreen or antivirus software may warn about
it. Confirm the GitHub Release URL and compare the artifact with its SHA-256 file before deciding
whether to continue. Do not disable antivirus globally.

## Security and privacy

All projects and databases remain local. The application does not upload FIFA data. Packaged builds
only contact GitHub Releases to check for application updates.

Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

Copyright &copy; 2026 [Dominik Hladík](https://github.com/Celtian).

Licensed under the [MIT License](LICENSE.md).

QDB Editor 16 is not affiliated with or endorsed by Electronic Arts.
