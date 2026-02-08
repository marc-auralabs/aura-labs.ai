#!/usr/bin/env node

/**
 * AURA Scout CLI
 *
 * Interactive command-line tool for testing Scout SDK and Core API.
 *
 * Usage:
 *   npx @aura-labs/scout --api-key YOUR_KEY
 *   npx @aura-labs/scout --api-key YOUR_KEY --intent "I need 100 widgets"
 */

import { createScout } from '../src/index.js';
import { createInterface } from 'readline';

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    flags[key] = value;
  }
}

// Configuration
const config = {
  apiKey: flags['api-key'] || process.env.AURA_API_KEY,
  coreUrl: flags['core-url'] || process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
};

// Help text
if (flags.help || flags.h) {
  console.log(`
AURA Scout CLI - Test buying agent interactions

Usage:
  scout-cli [options]

Options:
  --api-key KEY     Your AURA API key (or set AURA_API_KEY env var)
  --core-url URL    Core API URL (default: production)
  --intent "TEXT"   Run single intent and exit
  --max-budget N    Set maximum budget constraint
  --delivery-by D   Set delivery deadline (ISO date)
  --help, -h        Show this help

Interactive Mode:
  Start without --intent for interactive REPL mode.

Examples:
  scout-cli --api-key sk_test_123 --intent "I need office supplies"
  scout-cli --api-key sk_test_123 --intent "Buy 500 widgets" --max-budget 50000
  AURA_API_KEY=sk_test_123 scout-cli
`);
  process.exit(0);
}

// Validate API key
if (!config.apiKey) {
  console.error('Error: API key required. Use --api-key or set AURA_API_KEY');
  process.exit(1);
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function printJSON(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// Initialize Scout
let scout;
let currentSession = null;

async function init() {
  log(colors.cyan, '\n🔍 AURA Scout CLI v0.1.0');
  log(colors.dim, `   Core: ${config.coreUrl}`);

  scout = createScout(config);

  log(colors.dim, '   Registering with Core...');
  const { scoutId } = await scout.register();
  log(colors.green, `   ✓ Registered as ${scoutId}\n`);
}

// Single intent mode
async function runSingleIntent(intentText) {
  const options = {};
  if (flags['max-budget']) options.maxBudget = parseFloat(flags['max-budget']);
  if (flags['delivery-by']) options.deliveryBy = new Date(flags['delivery-by']);

  log(colors.blue, `\n📝 Intent: "${intentText}"`);
  if (options.maxBudget) log(colors.dim, `   Budget: $${options.maxBudget}`);
  if (options.deliveryBy) log(colors.dim, `   Deliver by: ${options.deliveryBy.toDateString()}`);

  try {
    const session = await scout.intent(intentText, options);
    log(colors.green, `\n✓ Session created: ${session.id}`);
    log(colors.dim, `   Status: ${session.status}`);

    if (session.intent?.parsed) {
      log(colors.dim, '   Parsed intent:');
      printJSON(session.intent.parsed);
    }

    log(colors.yellow, '\n⏳ Waiting for offers...');
    const offers = await session.waitForOffers({ timeout: 60000 });

    if (offers.length === 0) {
      log(colors.yellow, '   No offers received');
    } else {
      log(colors.green, `\n✓ Received ${offers.length} offer(s):\n`);
      for (const offer of offers) {
        log(colors.bright, `   ${offer.beaconName || offer.beaconId}`);
        log(colors.dim, `   $${offer.totalPrice} | Delivery: ${offer.deliveryDate || 'TBD'}`);
        log(colors.dim, `   Score: ${offer.score.toFixed(1)} | Meets constraints: ${offer.meetsConstraints}`);
        if (!offer.meetsConstraints) {
          log(colors.red, `   Violations: ${offer.constraintViolations.join(', ')}`);
        }
        console.log();
      }

      if (session.bestOffer) {
        log(colors.green, `   Best offer: ${session.bestOffer.beaconName || session.bestOffer.beaconId}`);
      }
    }
  } catch (error) {
    log(colors.red, `\n✗ Error: ${error.message}`);
    process.exit(1);
  }
}

// Interactive REPL mode
async function runInteractive() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colors.cyan + 'scout> ' + colors.reset,
  });

  console.log(`
${colors.bright}Commands:${colors.reset}
  intent <text>     Create session with purchase intent
  status            Show current session status
  offers            List current offers
  commit <id>       Commit to offer by ID
  cancel            Cancel current session
  budget <amount>   Set max budget for next session
  help              Show this help
  exit              Exit CLI
`);

  let constraints = {};

  rl.prompt();

  rl.on('line', async (line) => {
    const [command, ...rest] = line.trim().split(' ');
    const arg = rest.join(' ');

    try {
      switch (command.toLowerCase()) {
        case 'intent':
          if (!arg) {
            log(colors.red, 'Usage: intent <description>');
            break;
          }
          log(colors.blue, `\n📝 Creating session: "${arg}"`);
          currentSession = await scout.intent(arg, constraints);
          log(colors.green, `✓ Session: ${currentSession.id}`);
          log(colors.dim, `  Status: ${currentSession.status}`);
          break;

        case 'status':
          if (!currentSession) {
            log(colors.yellow, 'No active session. Use "intent <text>" first.');
            break;
          }
          await currentSession.refresh();
          log(colors.cyan, `\nSession: ${currentSession.id}`);
          log(colors.dim, `Status: ${currentSession.status}`);
          log(colors.dim, `Active: ${currentSession.isActive}`);
          break;

        case 'offers':
          if (!currentSession) {
            log(colors.yellow, 'No active session.');
            break;
          }
          log(colors.yellow, '⏳ Fetching offers...');
          const offers = await currentSession.waitForOffers({ timeout: 30000 });
          if (offers.length === 0) {
            log(colors.yellow, 'No offers yet.');
          } else {
            log(colors.green, `\n${offers.length} offer(s):\n`);
            for (const offer of offers) {
              console.log(`  [${offer.id.slice(0, 8)}] ${offer.beaconName || 'Unknown'} - $${offer.totalPrice} (score: ${offer.score.toFixed(1)})`);
            }
          }
          break;

        case 'commit':
          if (!currentSession) {
            log(colors.yellow, 'No active session.');
            break;
          }
          if (!arg) {
            log(colors.red, 'Usage: commit <offer-id>');
            break;
          }
          log(colors.yellow, `⏳ Committing to offer ${arg}...`);
          const tx = await currentSession.commit(arg);
          log(colors.green, `✓ Transaction: ${tx.id}`);
          break;

        case 'cancel':
          if (!currentSession) {
            log(colors.yellow, 'No active session.');
            break;
          }
          await currentSession.cancel();
          log(colors.green, '✓ Session cancelled');
          currentSession = null;
          break;

        case 'budget':
          if (!arg) {
            log(colors.dim, `Current max budget: ${constraints.maxBudget || 'not set'}`);
          } else {
            constraints.maxBudget = parseFloat(arg);
            log(colors.green, `✓ Max budget set to $${constraints.maxBudget}`);
          }
          break;

        case 'delivery':
          if (!arg) {
            log(colors.dim, `Delivery deadline: ${constraints.deliveryBy || 'not set'}`);
          } else {
            constraints.deliveryBy = new Date(arg);
            log(colors.green, `✓ Delivery deadline set to ${constraints.deliveryBy.toDateString()}`);
          }
          break;

        case 'help':
          console.log(`
${colors.bright}Commands:${colors.reset}
  intent <text>     Create session with purchase intent
  status            Show current session status
  offers            List current offers (polls until available)
  commit <id>       Commit to offer by ID
  cancel            Cancel current session
  budget <amount>   Set max budget for next session
  delivery <date>   Set delivery deadline (e.g., "2026-03-01")
  help              Show this help
  exit              Exit CLI
`);
          break;

        case 'exit':
        case 'quit':
          log(colors.dim, 'Goodbye!');
          rl.close();
          process.exit(0);
          break;

        case '':
          break;

        default:
          log(colors.red, `Unknown command: ${command}. Type "help" for commands.`);
      }
    } catch (error) {
      log(colors.red, `Error: ${error.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// Main
async function main() {
  try {
    await init();

    if (flags.intent) {
      await runSingleIntent(flags.intent);
    } else {
      await runInteractive();
    }
  } catch (error) {
    log(colors.red, `Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();
