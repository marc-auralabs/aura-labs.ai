#!/usr/bin/env node

/**
 * Cloud Services Provider - Test Beacon
 *
 * Simulates a cloud infrastructure provider offering:
 * - Compute instances (VMs)
 * - Storage solutions
 * - Database services
 * - AI/ML compute
 *
 * Matches intents containing: server, vm, compute, storage, database, cloud, hosting, gpu
 */

import { createBeacon } from '../src/index.js';

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;

// Service catalog (monthly pricing)
const CATALOG = {
  compute: {
    product: {
      name: 'Standard Compute Instance',
      sku: 'CLD-VM-STD',
      description: '4 vCPU, 16GB RAM, 100GB SSD, Linux/Windows',
      category: 'Compute',
      specs: { vcpu: 4, ram: '16GB', storage: '100GB SSD' },
    },
    unitPrice: 75.00, // per month
    billingPeriod: 'monthly',
    provisioningTime: '5 minutes',
  },
  'compute-large': {
    product: {
      name: 'High-Performance Compute Instance',
      sku: 'CLD-VM-HPC',
      description: '16 vCPU, 64GB RAM, 500GB NVMe SSD, dedicated cores',
      category: 'Compute',
      specs: { vcpu: 16, ram: '64GB', storage: '500GB NVMe' },
    },
    unitPrice: 299.00,
    billingPeriod: 'monthly',
    provisioningTime: '10 minutes',
  },
  gpu: {
    product: {
      name: 'GPU Compute Instance (A100)',
      sku: 'CLD-GPU-A100',
      description: 'NVIDIA A100 40GB, 8 vCPU, 64GB RAM, optimized for ML/AI',
      category: 'AI/ML',
      specs: { gpu: 'NVIDIA A100 40GB', vcpu: 8, ram: '64GB' },
    },
    unitPrice: 2.50, // per hour
    billingPeriod: 'hourly',
    provisioningTime: '15 minutes',
  },
  storage: {
    product: {
      name: 'Object Storage',
      sku: 'CLD-STR-OBJ',
      description: 'S3-compatible object storage, 99.999999999% durability',
      category: 'Storage',
      specs: { type: 'Object', durability: '11 9s', replication: '3x' },
    },
    unitPrice: 0.023, // per GB/month
    billingPeriod: 'per GB/month',
    provisioningTime: 'instant',
  },
  database: {
    product: {
      name: 'Managed PostgreSQL Database',
      sku: 'CLD-DB-PG',
      description: '2 vCPU, 8GB RAM, 100GB storage, automated backups, HA ready',
      category: 'Database',
      specs: { engine: 'PostgreSQL 16', vcpu: 2, ram: '8GB', storage: '100GB' },
    },
    unitPrice: 125.00,
    billingPeriod: 'monthly',
    provisioningTime: '15 minutes',
  },
  kubernetes: {
    product: {
      name: 'Managed Kubernetes Cluster',
      sku: 'CLD-K8S-STD',
      description: '3-node cluster, auto-scaling, managed control plane',
      category: 'Containers',
      specs: { nodes: 3, autoScaling: true, maxNodes: 10 },
    },
    unitPrice: 199.00, // base price + node costs
    billingPeriod: 'monthly',
    provisioningTime: '20 minutes',
  },
};

function matchProducts(intent) {
  const lower = intent.toLowerCase();
  const matches = [];

  if (lower.includes('gpu') || lower.includes('ml') || lower.includes('ai') || lower.includes('machine learning')) {
    matches.push('gpu');
  }
  if (lower.includes('kubernetes') || lower.includes('k8s') || lower.includes('container')) {
    matches.push('kubernetes');
  }
  if (lower.includes('database') || lower.includes('postgres') || lower.includes('mysql') || lower.includes('db')) {
    matches.push('database');
  }
  if (lower.includes('storage') || lower.includes('s3') || lower.includes('object storage') || lower.includes('bucket')) {
    matches.push('storage');
  }
  if (lower.includes('high performance') || lower.includes('hpc') || lower.includes('large server')) {
    matches.push('compute-large');
  }
  if (lower.includes('server') || lower.includes('vm') || lower.includes('virtual machine') ||
      lower.includes('compute') || lower.includes('instance') || lower.includes('hosting')) {
    if (!matches.includes('compute-large')) matches.push('compute');
  }
  // Generic cloud match
  if (lower.includes('cloud') && matches.length === 0) {
    matches.push('compute');
  }

  return matches;
}

function extractQuantity(intent, defaultQty = 1) {
  const match = intent.match(/(\d+)\s*(server|vm|instance|node|gpu|tb|gb|database)/i);
  if (match) {
    const qty = parseInt(match[1]);
    // For storage, convert TB to GB
    if (match[2].toLowerCase() === 'tb') return qty * 1000;
    return qty;
  }
  return defaultQty;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          ☁️  NIMBUS CLOUD - Test Beacon                   ║
║                                                           ║
║  "Infrastructure for the Modern Enterprise"               ║
╚═══════════════════════════════════════════════════════════╝
`);

  const beacon = createBeacon({
    coreUrl: CORE_URL,
    externalId: 'nimbus-cloud-001',
    name: 'Nimbus Cloud Services',
    description: 'Enterprise cloud infrastructure - compute, storage, databases, and AI/ML',
    capabilities: {
      services: ['compute', 'storage', 'database', 'kubernetes', 'gpu', 'ai/ml'],
      regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
      compliance: ['SOC2', 'HIPAA', 'GDPR'],
      sla: '99.95%',
    },
    pollIntervalMs: POLL_INTERVAL,
  });

  console.log(`📡 Connecting to Core: ${CORE_URL}`);

  try {
    const reg = await beacon.register();
    console.log(`✅ Registered as: ${reg.name} (${reg.beaconId})`);
  } catch (error) {
    console.error(`❌ Registration failed: ${error.message}`);
    process.exit(1);
  }

  beacon.onSession(async (session, beacon) => {
    const intent = session.intent?.raw || '';
    console.log(`\n📥 Session: ${session.sessionId}`);
    console.log(`   Intent: "${intent}"`);

    const matches = matchProducts(intent);

    if (matches.length === 0) {
      console.log(`   ⏭️  No matching services`);
      return;
    }

    for (const serviceKey of matches.slice(0, 2)) {
      const catalogItem = CATALOG[serviceKey];
      let quantity = extractQuantity(intent, serviceKey === 'storage' ? 100 : 1);

      // Volume discounts for committed use
      let unitPrice = catalogItem.unitPrice;
      if (quantity >= 10) unitPrice *= 0.80; // 20% off for 10+ instances
      if (quantity >= 50) unitPrice *= 0.70; // 30% off for 50+

      // For storage, the quantity is in GB
      const displayQty = serviceKey === 'storage' ? `${quantity} GB` : quantity;
      const total = unitPrice * quantity;

      const offer = {
        product: catalogItem.product,
        unitPrice: Math.round(unitPrice * 1000) / 1000, // 3 decimal places for cloud pricing
        quantity,
        currency: 'USD',
        deliveryDate: new Date().toISOString().split('T')[0], // Immediate provisioning
        terms: {
          billingPeriod: catalogItem.billingPeriod,
          provisioningTime: catalogItem.provisioningTime,
          sla: '99.95% uptime guarantee',
          support: '24/7 support included',
          commitment: quantity >= 10 ? '1-year reserved pricing' : 'Pay as you go',
          cancellation: 'Cancel anytime, pro-rated refund',
        },
        metadata: {
          serviceType: 'cloud',
          regions: ['us-east-1', 'us-west-2'],
          compliance: ['SOC2'],
        },
      };

      console.log(`   ✅ Match: ${catalogItem.product.name}`);
      console.log(`      ${displayQty} × $${offer.unitPrice}/${catalogItem.billingPeriod} = $${total.toFixed(2)}/${catalogItem.billingPeriod}`);

      try {
        await beacon.submitOffer(session.sessionId, offer);
        console.log(`   📤 Offer submitted!`);
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
  });

  console.log(`\n🔄 Polling for sessions (every ${POLL_INTERVAL/1000}s)...`);
  console.log(`   Press Ctrl+C to stop\n`);

  await beacon.startPolling();

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    beacon.stopPolling();
    process.exit(0);
  });
}

main().catch(console.error);
