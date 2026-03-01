/**
 * Vitest Configuration for AURA Scout Chrome Extension
 *
 * Uses jsdom environment for browser API mocking.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js', 'src/shared/**/*.js'],
    },
  },
});
