#!/usr/bin/env node

/**
 * Protocol Scenario Test Runner
 *
 * Runs all protocol scenario tests for the Scout SDK:
 * - AP2 Mandates scenarios
 * - Visa TAP scenarios
 * - MCP Client scenarios
 * - Integration scenarios
 *
 * Usage:
 *   node src/tests/scenarios/index.js
 *
 * Or via npm:
 *   npm run test:scenarios
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scenarioFiles = [
  'ap2-scenarios.test.js',
  'tap-scenarios.test.js',
  'mcp-scenarios.test.js',
  'integration-scenarios.test.js',
];

console.log('\n' + '═'.repeat(70));
console.log('  AURA Scout SDK - Protocol Scenario Tests');
console.log('═'.repeat(70) + '\n');

console.log('Running scenario tests for:');
console.log('  • AP2 Mandates (Google Agent Payments Protocol)');
console.log('  • Visa TAP (Trusted Agent Protocol)');
console.log('  • MCP Client (Model Context Protocol)');
console.log('  • Integration (All protocols combined)');
console.log('');

const testPaths = scenarioFiles.map(f => join(__dirname, f));

const child = spawn('node', ['--test', ...testPaths], {
  stdio: 'inherit',
  cwd: join(__dirname, '../../..'),
});

child.on('exit', (code) => {
  console.log('\n' + '═'.repeat(70));
  if (code === 0) {
    console.log('  ✅ All scenario tests passed!');
  } else {
    console.log('  ❌ Some tests failed');
  }
  console.log('═'.repeat(70) + '\n');
  process.exit(code);
});
