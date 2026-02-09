#!/usr/bin/env node

/**
 * Protocol Test Runner
 *
 * Runs all protocol implementation tests:
 * - MCP Client
 * - AP2 Mandates
 * - Visa TAP
 *
 * Usage:
 *   node src/tests/run-protocol-tests.js
 *
 * Or with Node's test runner directly:
 *   node --test src/tests/mcp-client.test.js src/tests/ap2-mandates.test.js src/tests/visa-tap.test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testFiles = [
  'mcp-client.test.js',
  'ap2-mandates.test.js',
  'visa-tap.test.js',
];

console.log('\n' + '═'.repeat(70));
console.log('  AURA Scout SDK - Protocol Tests');
console.log('═'.repeat(70) + '\n');

console.log('Running tests for:');
console.log('  • MCP Client (Model Context Protocol)');
console.log('  • AP2 Mandates (Agent Payments Protocol)');
console.log('  • Visa TAP (Trusted Agent Protocol)');
console.log('');

const testPaths = testFiles.map(f => join(__dirname, f));

const child = spawn('node', ['--test', ...testPaths], {
  stdio: 'inherit',
  cwd: join(__dirname, '../..'),
});

child.on('exit', (code) => {
  console.log('\n' + '═'.repeat(70));
  if (code === 0) {
    console.log('  ✅ All protocol tests passed!');
  } else {
    console.log('  ❌ Some tests failed');
  }
  console.log('═'.repeat(70) + '\n');
  process.exit(code);
});
