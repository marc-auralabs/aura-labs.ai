/**
 * esbuild configuration for AURA Scout Chrome Extension
 *
 * Bundles source files for Manifest V3 compatibility.
 * MV3 forbids eval() and dynamic imports, so we use esbuild
 * to produce static bundles.
 */

import { build } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
  minify: false,
};

const entryPoints = [
  {
    entryPoints: ['src/background/service-worker.js'],
    outfile: 'dist/service-worker.js',
    ...commonOptions,
  },
  {
    entryPoints: ['src/sidepanel/sidepanel.js'],
    outfile: 'dist/sidepanel.js',
    ...commonOptions,
  },
  {
    entryPoints: ['src/popup/popup.js'],
    outfile: 'dist/popup.js',
    ...commonOptions,
  },
  {
    entryPoints: ['src/content/extractor.js'],
    outfile: 'dist/extractor.js',
    ...commonOptions,
    format: 'iife',
  },
];

async function run() {
  try {
    for (const config of entryPoints) {
      if (isWatch) {
        const ctx = await build({ ...config, plugins: [] });
        // esbuild watch mode is not used directly here;
        // use build:watch script for development
      } else {
        await build(config);
      }
    }
    console.log('Build complete');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

run();
