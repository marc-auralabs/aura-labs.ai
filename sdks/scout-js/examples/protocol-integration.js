#!/usr/bin/env node

/**
 * Protocol Integration Example
 *
 * Demonstrates how to use MCP, AP2, and Visa TAP together
 * in a complete agentic commerce flow:
 *
 * 1. MCP - Connect to external tools for context
 * 2. AP2 - Create user-signed mandates for authorization
 * 3. TAP - Sign requests for payment network verification
 *
 * Usage:
 *   node examples/protocol-integration.js
 *
 * Environment:
 *   AURA_CORE_URL - Core API URL (optional)
 *   USER_PRIVATE_KEY - User's signing key (optional, generates one)
 */

import {
  createScout,
  MCPClient,
  AP2Mandates,
  generateAP2KeyPair,
  VisaTAP,
} from '../src/index.js';

// =============================================================================
// Configuration
// =============================================================================

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';

// Generate keys for demo (in production, these would be stored securely)
const userKeys = generateAP2KeyPair();
const agentKeys = VisaTAP.generateKeyPair();

// =============================================================================
// Main Demo Flow
// =============================================================================

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  Protocol Integration Demo: MCP + AP2 + Visa TAP');
  console.log('═'.repeat(70) + '\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Initialize MCP Client (external tool access)
  // ─────────────────────────────────────────────────────────────────────────

  console.log('📡 Step 1: MCP Client Initialization\n');

  const mcp = new MCPClient({
    clientInfo: {
      name: 'aura-scout-demo',
      version: '1.0.0',
    },
  });

  // In production, you'd connect to real MCP servers
  // For demo, we'll simulate the tool discovery
  console.log('   Connecting to MCP servers...');
  console.log('   (In production: await mcp.connect("https://tools.example.com/sse"))');
  console.log('   ✓ MCP client ready\n');

  // Example: List available tools from connected servers
  // const tools = await mcp.listAllTools();
  // console.log('   Available tools:', tools.map(t => t.name).join(', '));

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Register Agent with Visa TAP
  // ─────────────────────────────────────────────────────────────────────────

  console.log('🔑 Step 2: Visa TAP Agent Registration\n');

  const agentId = `demo-scout-${Date.now()}`;

  // In production, this calls Visa's TAP registry
  const tapRegistration = await VisaTAP.register({
    agentId,
    publicKey: agentKeys.publicKey,
    metadata: {
      name: 'AURA Shopping Scout',
      operator: 'AURA Labs',
      capabilities: ['shopping', 'comparison', 'payments'],
      version: '1.0',
    },
  });

  console.log('   Agent ID:', agentId);
  console.log('   TAP ID:', tapRegistration.tapId);
  console.log('   Status:', tapRegistration.status);
  console.log('   Expires:', tapRegistration.expiresAt);
  console.log('   ✓ Agent registered with TAP\n');

  const tapCredentials = VisaTAP.createCredentials({
    tapId: tapRegistration.tapId,
    keyPair: agentKeys,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Create Intent Mandate (user authorization)
  // ─────────────────────────────────────────────────────────────────────────

  console.log('📜 Step 3: AP2 Intent Mandate Creation\n');

  const userId = 'user-demo-001';
  const intentMandate = await AP2Mandates.createIntent({
    agentId,
    userId,
    userKey: userKeys.privateKey,
    constraints: {
      maxAmount: 5000,
      currency: 'USD',
      categories: ['electronics', 'office-supplies'],
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      merchantBlocklist: ['sketchy-seller-123'],
      requireUserPresent: false, // Agent can shop autonomously
      maxTransactions: 3,
    },
    metadata: {
      purpose: 'Office equipment upgrade',
      department: 'Engineering',
    },
  });

  console.log('   Mandate ID:', intentMandate.id);
  console.log('   Type:', intentMandate.type);
  console.log('   Max Amount:', `$${intentMandate.constraints.maxAmount} ${intentMandate.constraints.currency}`);
  console.log('   Categories:', intentMandate.constraints.categories.join(', '));
  console.log('   Valid Until:', intentMandate.constraints.validUntil);
  console.log('   Proof Type:', intentMandate.proof.type);
  console.log('   ✓ Intent mandate signed by user\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Simulate Shopping Session
  // ─────────────────────────────────────────────────────────────────────────

  console.log('🛒 Step 4: Shopping Session (Simulated)\n');

  // In a real flow, Scout would:
  // 1. Create a session via AURA Core
  // 2. Receive offers from Beacons
  // 3. Evaluate against mandate constraints

  const simulatedOffer = {
    id: 'offer-abc-123',
    beaconId: 'beacon-techmart-001',
    beaconName: 'TechMart Electronics',
    product: {
      name: 'ProBook Business Laptop',
      sku: 'ELEC-LAP-001',
    },
    unitPrice: 1299.00,
    quantity: 2,
    totalPrice: 2598.00,
    currency: 'USD',
    deliveryDate: '2026-02-15',
  };

  console.log('   Received offer:');
  console.log(`   - Product: ${simulatedOffer.product.name}`);
  console.log(`   - Merchant: ${simulatedOffer.beaconName}`);
  console.log(`   - Price: $${simulatedOffer.totalPrice}`);
  console.log(`   - Delivery: ${simulatedOffer.deliveryDate}\n`);

  // Validate offer against intent mandate
  const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
    totalAmount: simulatedOffer.totalPrice,
    currency: simulatedOffer.currency,
    category: 'electronics',
    merchantId: simulatedOffer.beaconId,
  });

  if (validation.valid) {
    console.log('   ✓ Offer passes intent mandate validation\n');
  } else {
    console.log('   ✗ Offer fails validation:', validation.errors.join(', '));
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Create Cart Mandate (explicit user approval)
  // ─────────────────────────────────────────────────────────────────────────

  console.log('🎯 Step 5: AP2 Cart Mandate Creation\n');

  const cartMandate = await AP2Mandates.createCart({
    sessionId: 'session-xyz-789',
    offer: simulatedOffer,
    userKey: userKeys.privateKey,
    userId,
    intentMandateId: intentMandate.id,
    metadata: {
      approvalMethod: 'user-confirmation',
    },
  });

  console.log('   Cart Mandate ID:', cartMandate.id);
  console.log('   Intent Mandate Ref:', cartMandate.intentMandateRef);
  console.log('   Total Amount:', `$${cartMandate.cart.totalAmount}`);
  console.log('   User Present:', cartMandate.userPresent);
  console.log('   Expires:', cartMandate.expiresAt);
  console.log('   ✓ Cart mandate signed by user\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Create Payment Mandate + TAP-Signed Request
  // ─────────────────────────────────────────────────────────────────────────

  console.log('💳 Step 6: Payment Mandate + TAP Signing\n');

  const paymentMandate = await AP2Mandates.createPayment({
    cartMandate,
    paymentMethod: {
      type: 'card',
      network: 'visa',
    },
    agentId,
    agentKey: agentKeys.privateKey,
    tapCredentials,
  });

  console.log('   Payment Mandate ID:', paymentMandate.id);
  console.log('   TAP ID:', paymentMandate.agent.tapId);
  console.log('   Amount:', `$${paymentMandate.transaction.amount} ${paymentMandate.transaction.currency}`);
  console.log('   Payment Network:', paymentMandate.paymentMethod.network);
  console.log('   User Auth Time:', paymentMandate.riskSignals.userAuthTime);
  console.log('   ✓ Payment mandate signed by agent\n');

  // Sign the payment request with Visa TAP
  const paymentRequest = {
    method: 'POST',
    url: 'https://payment.example.com/api/v1/process',
    headers: {},
    body: {
      amount: paymentMandate.transaction.amount,
      currency: paymentMandate.transaction.currency,
      merchantId: paymentMandate.transaction.merchantId,
      mandateId: paymentMandate.id,
      cartMandateId: paymentMandate.cartMandateRef,
    },
  };

  const signedRequest = await VisaTAP.signRequest(paymentRequest, tapCredentials);

  console.log('   TAP-Signed Request Headers:');
  console.log(`   - X-TAP-Agent-Id: ${signedRequest.headers['X-TAP-Agent-Id']}`);
  console.log(`   - X-TAP-Timestamp: ${signedRequest.headers['X-TAP-Timestamp']}`);
  console.log(`   - Signature-Input: ${signedRequest.headers['Signature-Input'].substring(0, 50)}...`);
  console.log('   ✓ Request signed for TAP verification\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────

  console.log('═'.repeat(70));
  console.log('  Protocol Integration Summary');
  console.log('═'.repeat(70) + '\n');

  console.log('  MCP:');
  console.log('    • Client initialized for external tool access');
  console.log('    • Can connect to any MCP-compatible server');
  console.log('');

  console.log('  Visa TAP:');
  console.log(`    • Agent registered: ${tapRegistration.tapId}`);
  console.log('    • HTTP Message Signatures enabled');
  console.log('    • Payment network can verify agent identity');
  console.log('');

  console.log('  AP2 Mandates:');
  console.log(`    • Intent Mandate: ${intentMandate.id}`);
  console.log(`    • Cart Mandate: ${cartMandate.id}`);
  console.log(`    • Payment Mandate: ${paymentMandate.id}`);
  console.log('    • Complete audit trail from intent → cart → payment');
  console.log('');

  console.log('  Transaction Flow:');
  console.log('    User → Intent Mandate → Agent shopping → Cart Mandate →');
  console.log('    Payment Mandate + TAP Signature → Payment Network');
  console.log('');

  console.log('═'.repeat(70) + '\n');
}

// =============================================================================
// Run Demo
// =============================================================================

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
