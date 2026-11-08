// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/generated/**',
      'apps/e2e/playwright-report/**',
      'apps/e2e/test-results/**',
      'apps/e2e/demo-output/**',
    ],
  },

  // Base rules for every TypeScript file in the monorepo.
  // "TypeChecked" presets read tsconfig, so rules can use type information
  // (e.g. catching un-awaited promises), not just syntax.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        // Config files outside any tsconfig "include" get a default project.
        projectService: {
          allowDefaultProject: [
            'apps/api/prisma.config.ts',
            'apps/api/vitest.config.ts',
            'apps/api/vitest.integration.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Node: api + shared.
  {
    files: ['apps/api/**/*.ts', 'apps/e2e/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Browser + React: web.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // React escapes everything it renders, which is what keeps user text from
      // running as a script. This attribute is the one way around that.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'User text must never be rendered as raw HTML.',
        },
      ],
    },
  },

  // Plain JS config files (this file): no type-aware rules.
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Must be last: turns off every rule that would fight Prettier's formatting.
  prettier,
);
