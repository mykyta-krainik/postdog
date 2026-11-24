import nextPlugin from '@next/eslint-plugin-next';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import base from '../../eslint.config.js';

/** A slice is imported only through its public API. */
const SLICE_ENTRY = 'index.{ts,tsx}';

/** Each FSD layer may import the layers listed after it, and nothing above or beside it. */
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

const layerPolicies = LAYERS.slice(0, -1).map((layer, index) => ({
  from: { element: { type: layer } },
  allow: {
    to: {
      element: LAYERS.slice(index + 1).map((lower) =>
        lower === 'shared' ? { type: 'shared' } : { type: lower, fileInternalPath: SLICE_ENTRY },
      ),
    },
  },
}));

export default defineConfig(
  base,
  { ignores: ['next-env.d.ts'] },
  nextPlugin.configs['core-web-vitals'],
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: `${import.meta.dirname}/tsconfig.json` },
      },
      'boundaries/root-path': import.meta.dirname,
      'boundaries/elements': [
        { type: 'routes', pattern: 'app' },
        { type: 'app', pattern: 'src/_app' },
        { type: 'pages', pattern: 'src/_pages/*', capture: ['slice'] },
        { type: 'widgets', pattern: 'src/widgets/*', capture: ['slice'] },
        { type: 'features', pattern: 'src/features/*', capture: ['slice'] },
        { type: 'entities', pattern: 'src/entities/*', capture: ['slice'] },
        { type: 'shared', pattern: 'src/shared/*', capture: ['segment'] },
      ],
    },
    rules: {
      ...boundaries.configs.recommended.rules,
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message:
            "FSD: {{ from.element.type }} cannot import this file of {{ to.element.type }}. Import only from a lower layer, never from a sibling slice, and only through the slice's index.ts.",
          policies: [
            {
              from: { element: { type: 'routes' } },
              allow: {
                to: {
                  element: [
                    { type: 'app', fileInternalPath: SLICE_ENTRY },
                    { type: 'pages', fileInternalPath: SLICE_ENTRY },
                  ],
                },
              },
            },
            ...layerPolicies,
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'shared' } } },
            },
          ],
        },
      ],
    },
  },
);
