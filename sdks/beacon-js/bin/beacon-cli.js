#!/usr/bin/env node

/**
 * AURA Beacon CLI
 *
 * Run test beacons from the command line.
 *
 * Usage:
 *   beacon-cli list              - List available beacons
 *   beacon-cli run <name>        - Run a specific beacon
 *   beacon-cli run all           - Run all beacons
 *   beacon-cli info              - Show connection info
 *
 * Environment:
 *   AURA_CORE_URL   - Core API URL (default: production)
 *   POLL_INTERVAL   - Poll interval in ms (default: 3000)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const examplesDir = join(__dirname, '..', 'examples');

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';

const BEACONS = {
  widgets: {
    name: 'Acme Widget Co.',
    file: 'widget-supplier.js',
    description: 'Industrial widgets and manufacturing supplies',
    keywords: ['widget', 'industrial', 'manufacturing'],
  },
  electronics: {
    name: 'TechMart Electronics',
    file: 'electronics-vendor.js',
    description: 'Laptops, monitors, keyboards, and accessories',
    keywords: ['laptop', 'computer', 'monitor', 'keyboard', 'mouse'],
  },
  office: {
    name: 'OfficeMax Pro',
    file: 'office-supplies.js',
    description: 'Desks, chairs, paper, and office equipment',
    keywords: ['desk', 'chair', 'paper', 'printer', 'office'],
  },
  cloud: {
    name: 'Nimbus Cloud Services',
    file: 'cloud-services.js',
    description: 'VMs, storage, databases, and Kubernetes',
    keywords: ['server', 'vm', 'cloud', 'database', 'storage', 'gpu'],
  },
  travel: {
    name: 'Wanderlust Travel Agency',
    file: 'travel-agent.js',
    description: 'Flights, hotels, car rentals, and packages',
    keywords: ['flight', 'hotel', 'travel', 'vacation', 'trip'],
  },
  all: {
    name: 'All Beacons (Marketplace Demo)',
    file: 'run-all-beacons.js',
    description: 'Run all beacons simultaneously',
    keywords: [],
  },
};

function showBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║            🔥 AURA Beacon CLI                             ║
╚═══════════════════════════════════════════════════════════╝
`);
}

function showHelp() {
  showBanner();
  console.log(`Usage: beacon-cli <command> [options]

Commands:
  list              List available beacon stubs
  run <name>        Run a specific beacon (or 'all')
  info              Show connection info

Beacons:
  widgets           Industrial widgets
  electronics       Computers and accessories
  office            Office furniture and supplies
  cloud             Cloud infrastructure services
  travel            Flights, hotels, packages
  all               Run all beacons together

Examples:
  beacon-cli list
  beacon-cli run widgets
  beacon-cli run all
  AURA_CORE_URL=http://localhost:3000 beacon-cli run electronics
`);
}

function listBeacons() {
  showBanner();
  console.log('Available Beacons:\n');

  for (const [key, beacon] of Object.entries(BEACONS)) {
    if (key === 'all') continue;
    console.log(`  ${key.padEnd(12)} ${beacon.name}`);
    console.log(`  ${''.padEnd(12)} ${beacon.description}`);
    console.log(`  ${''.padEnd(12)} Keywords: ${beacon.keywords.join(', ')}`);
    console.log();
  }

  console.log(`  ${'all'.padEnd(12)} Run all beacons (marketplace demo)\n`);
  console.log(`Run with: beacon-cli run <name>\n`);
}

function showInfo() {
  showBanner();
  console.log(`Connection Info:\n`);
  console.log(`  Core URL:      ${CORE_URL}`);
  console.log(`  Poll Interval: ${process.env.POLL_INTERVAL || 3000}ms`);
  console.log(`\nEnvironment Variables:`);
  console.log(`  AURA_CORE_URL   Override the Core API URL`);
  console.log(`  POLL_INTERVAL   Polling interval in milliseconds\n`);
}

function runBeacon(name) {
  const beacon = BEACONS[name];

  if (!beacon) {
    console.error(`❌ Unknown beacon: ${name}`);
    console.log(`\nAvailable beacons: ${Object.keys(BEACONS).join(', ')}`);
    process.exit(1);
  }

  const filePath = join(examplesDir, beacon.file);

  console.log(`\n🚀 Starting: ${beacon.name}\n`);

  const child = spawn('node', [filePath], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (error) => {
    console.error(`❌ Failed to start beacon: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// Parse command line
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'list':
  case 'ls':
    listBeacons();
    break;

  case 'run':
  case 'start':
    const beaconName = args[1];
    if (!beaconName) {
      console.error('❌ Please specify a beacon name');
      console.log('Usage: beacon-cli run <name>');
      console.log(`Available: ${Object.keys(BEACONS).join(', ')}`);
      process.exit(1);
    }
    runBeacon(beaconName);
    break;

  case 'info':
    showInfo();
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    if (command && BEACONS[command]) {
      // Allow shorthand: beacon-cli widgets
      runBeacon(command);
    } else {
      showHelp();
    }
}
