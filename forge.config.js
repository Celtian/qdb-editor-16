const { version } = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'QDB Editor 16',
    icon: 'resources/icons/qdb-editor-16.ico',
    ignore: [
      /^\/examples/,
      /^\/projects/,
      /^\/tools/,
      /^\/\.git/,
      /^\/\.angular/,
      /^\/coverage/,
      /^\/out/,
      /^\/node_modules\/quick-commitlint/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'qdb_editor_16',
        setupExe: 'QDB-Editor-16-Setup.exe',
        setupIcon: 'resources/icons/qdb-editor-16.ico',
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'Celtian', name: 'qdb-editor-16' },
        draft: false,
        prerelease: version.includes('-'),
      },
    },
  ],
};
