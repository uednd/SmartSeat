import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.cache/**',
      'firmware/**/build/**'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly'
      }
    }
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        project: false
      }
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off'
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
];
