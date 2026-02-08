#!/bin/bash

# AURA End-to-End Test Script
# Tests the full Scout → Core → Beacon → Transaction flow

CORE_URL="${AURA_CORE_URL:-https://aura-labsai-production.up.railway.app}"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           🔥 AURA End-to-End Test                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Core URL: $CORE_URL"
echo ""

# Helper to extract JSON field using Python
json_get() {
  python3 -c "import sys,json; print(json.load(sys.stdin).get('$1',''))" 2>/dev/null
}

# Step 1: Register Beacon
echo "1️⃣  Registering Beacon..."
BEACON_RESPONSE=$(curl -s -X POST "$CORE_URL/beacons/register" \
  -H "Content-Type: application/json" \
  -d '{"externalId":"acme-test-beacon","name":"Acme Widget Co.","capabilities":{"products":["widgets"]}}')

BEACON_ID=$(echo "$BEACON_RESPONSE" | json_get beaconId)
echo "   Beacon ID: $BEACON_ID"

# Step 2: Register Scout
echo "2️⃣  Registering Scout..."
SCOUT_RESPONSE=$(curl -s -X POST "$CORE_URL/scouts/register" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"test-key","metadata":{"name":"Test Scout"}}')

SCOUT_ID=$(echo "$SCOUT_RESPONSE" | json_get scoutId)
echo "   Scout ID: $SCOUT_ID"

# Step 3: Scout creates session
echo "3️⃣  Creating session with intent..."
SESSION_RESPONSE=$(curl -s -X POST "$CORE_URL/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"intent\":\"I need 500 industrial widgets, budget max \$50000\",\"scoutId\":\"$SCOUT_ID\",\"constraints\":{\"maxBudget\":50000}}")

SESSION_ID=$(echo "$SESSION_RESPONSE" | json_get sessionId)
SESSION_STATUS=$(echo "$SESSION_RESPONSE" | json_get status)
echo "   Session ID: $SESSION_ID"
echo "   Status: $SESSION_STATUS"

# Step 4: Beacon submits offer
echo "4️⃣  Beacon submitting offer..."
OFFER_RESPONSE=$(curl -s -X POST "$CORE_URL/sessions/$SESSION_ID/offers" \
  -H "Content-Type: application/json" \
  -d "{\"beaconId\":\"$BEACON_ID\",\"product\":{\"name\":\"Industrial Widget\",\"sku\":\"WDG-001\"},\"unitPrice\":85.00,\"quantity\":500,\"deliveryDate\":\"2026-02-20\",\"terms\":{\"warranty\":\"2 years\"}}")

OFFER_ID=$(echo "$OFFER_RESPONSE" | json_get offerId)
echo "   Offer ID: $OFFER_ID"
echo "   Price: 500 × \$85 = \$42,500"

# Step 5: Check session status
echo "5️⃣  Checking session..."
SESSION_CHECK=$(curl -s "$CORE_URL/sessions/$SESSION_ID")
NEW_STATUS=$(echo "$SESSION_CHECK" | json_get status)
echo "   Status: $NEW_STATUS"

# Step 6: Get offers
echo "6️⃣  Retrieving offers..."
OFFERS_RESPONSE=$(curl -s "$CORE_URL/sessions/$SESSION_ID/offers")
echo "   Response: $(echo "$OFFERS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{len(d.get('offers',[]))} offer(s)\")" 2>/dev/null)"

# Step 7: Commit to offer
echo "7️⃣  Committing to offer..."
COMMIT_RESPONSE=$(curl -s -X POST "$CORE_URL/sessions/$SESSION_ID/commit" \
  -H "Content-Type: application/json" \
  -d "{\"offerId\":\"$OFFER_ID\"}")

TX_ID=$(echo "$COMMIT_RESPONSE" | json_get transactionId)
TX_STATUS=$(echo "$COMMIT_RESPONSE" | json_get status)
echo "   Transaction ID: $TX_ID"
echo "   Status: $TX_STATUS"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ TEST COMPLETE!"
echo ""
echo "  Scout:       $SCOUT_ID"
echo "  Beacon:      $BEACON_ID"
echo "  Session:     $SESSION_ID"
echo "  Offer:       $OFFER_ID"
echo "  Transaction: $TX_ID"
echo ""
echo "🔥 The beacons were lit, and Rohan answered! 🐴"
