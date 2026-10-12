// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `tsc --noEmit` already checks every import (incl. the "@/..." alias and workspace packages);
    // these resolver-based rules cannot see the alias from the hoisted plugin in this monorepo.
    rules: {
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/named': 'off',
      'import/default': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
