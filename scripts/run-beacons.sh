#!/bin/bash

#
# AURA Beacon Runner (No Node.js Required)
#
# Simulates multiple beacons using curl and bash.
# Polls for sessions and submits offers based on intent matching.
#
# Usage:
#   ./scripts/run-beacons.sh           # Run all beacons
#   ./scripts/run-beacons.sh widgets   # Run specific beacon
#   ./scripts/run-beacons.sh list      # List available beacons
#

CORE_URL="${AURA_CORE_URL:-https://aura-labsai-production.up.railway.app}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Beacon IDs (set after registration)
BEACON_ID_WIDGETS=""
BEACON_ID_ELECTRONICS=""
BEACON_ID_OFFICE=""
BEACON_ID_CLOUD=""
BEACON_ID_TRAVEL=""

# Seen sessions (stored in temp file for bash 3.x compatibility)
SEEN_FILE=$(mktemp)
trap "rm -f $SEEN_FILE" EXIT

# Helper: JSON value extraction
json_val() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$2',''))" 2>/dev/null
}

# Helper: Get delivery date N business days from now
get_delivery_date() {
  local days=$1
  python3 -c "
import datetime
d = datetime.date.today()
added = 0
while added < $days:
    d += datetime.timedelta(days=1)
    if d.weekday() < 5:
        added += 1
print(d.isoformat())
"
}

# Check if session was already seen
is_seen() {
  grep -q "^$1$" "$SEEN_FILE" 2>/dev/null
}

# Mark session as seen
mark_seen() {
  echo "$1" >> "$SEEN_FILE"
}

# Register a beacon
register_beacon() {
  local external_id=$1
  local name=$2
  local description=$3

  local response=$(curl -s -X POST "${CORE_URL}/beacons/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"externalId\": \"${external_id}\",
      \"name\": \"${name}\",
      \"description\": \"${description}\"
    }")

  local beacon_id=$(json_val "$response" "beaconId")

  if [ -n "$beacon_id" ]; then
    echo "$beacon_id"
    return 0
  else
    echo ""
    return 1
  fi
}

# Submit an offer
submit_offer() {
  local session_id=$1
  local beacon_id=$2
  local product_name=$3
  local sku=$4
  local unit_price=$5
  local quantity=$6
  local delivery_days=$7

  local delivery_date=$(get_delivery_date $delivery_days)
  local total_price=$(python3 -c "print($unit_price * $quantity)")

  local response=$(curl -s -X POST "${CORE_URL}/sessions/${session_id}/offers" \
    -H "Content-Type: application/json" \
    -d "{
      \"beaconId\": \"${beacon_id}\",
      \"product\": {\"name\": \"${product_name}\", \"sku\": \"${sku}\"},
      \"unitPrice\": ${unit_price},
      \"quantity\": ${quantity},
      \"totalPrice\": ${total_price},
      \"currency\": \"USD\",
      \"deliveryDate\": \"${delivery_date}\"
    }")

  local offer_id=$(json_val "$response" "offerId")

  if [ -n "$offer_id" ]; then
    echo -e "   ${GREEN}📤 Offer submitted:${NC} ${quantity} × \$${unit_price} = \$${total_price}"
    return 0
  else
    echo -e "   ${RED}❌ Offer failed${NC}"
    return 1
  fi
}

# Process a session with widget matching
process_widgets() {
  local session_id=$1
  local intent=$2
  local beacon_id=$BEACON_ID_WIDGETS

  [ -z "$beacon_id" ] && return 1

  local lower=$(echo "$intent" | tr '[:upper:]' '[:lower:]')

  if [[ "$lower" == *"widget"* ]]; then
    # Extract quantity or default to 500
    local qty=$(echo "$intent" | grep -oE '[0-9]+' | head -1)
    qty=${qty:-500}
    [ $qty -lt 100 ] && qty=100
    [ $qty -gt 10000 ] && qty=10000

    echo -e "${YELLOW}🏭 Acme Widgets${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Industrial Widget" "WDG-IND-001" 85.00 $qty 5
    return 0
  fi
  return 1
}

# Process a session with electronics matching
process_electronics() {
  local session_id=$1
  local intent=$2
  local beacon_id=$BEACON_ID_ELECTRONICS

  [ -z "$beacon_id" ] && return 1

  local lower=$(echo "$intent" | tr '[:upper:]' '[:lower:]')

  if [[ "$lower" == *"laptop"* ]] || [[ "$lower" == *"computer"* ]]; then
    echo -e "${CYAN}💻 TechMart${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "ProBook Business Laptop" "ELEC-LAP-001" 1299.00 1 3
    return 0
  elif [[ "$lower" == *"monitor"* ]] || [[ "$lower" == *"display"* ]]; then
    echo -e "${CYAN}💻 TechMart${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "27\" 4K Monitor" "ELEC-MON-001" 449.00 1 2
    return 0
  elif [[ "$lower" == *"keyboard"* ]] || [[ "$lower" == *"mouse"* ]]; then
    echo -e "${CYAN}💻 TechMart${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Ergonomic Keyboard" "ELEC-KEY-001" 149.00 1 1
    return 0
  fi
  return 1
}

# Process a session with office matching
process_office() {
  local session_id=$1
  local intent=$2
  local beacon_id=$BEACON_ID_OFFICE

  [ -z "$beacon_id" ] && return 1

  local lower=$(echo "$intent" | tr '[:upper:]' '[:lower:]')

  if [[ "$lower" == *"desk"* ]]; then
    echo -e "${BLUE}📎 OfficeMax${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Adjustable Standing Desk" "OFF-DSK-001" 599.00 1 7
    return 0
  elif [[ "$lower" == *"chair"* ]]; then
    echo -e "${BLUE}📎 OfficeMax${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Ergonomic Executive Chair" "OFF-CHR-001" 449.00 1 5
    return 0
  elif [[ "$lower" == *"paper"* ]] || [[ "$lower" == *"office"* ]]; then
    echo -e "${BLUE}📎 OfficeMax${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Premium Copy Paper (Case)" "OFF-PPR-001" 54.99 5 2
    return 0
  fi
  return 1
}

# Process a session with cloud matching
process_cloud() {
  local session_id=$1
  local intent=$2
  local beacon_id=$BEACON_ID_CLOUD

  [ -z "$beacon_id" ] && return 1

  local lower=$(echo "$intent" | tr '[:upper:]' '[:lower:]')

  if [[ "$lower" == *"gpu"* ]] || [[ "$lower" == *"ml"* ]] || [[ "$lower" == *"ai"* ]]; then
    echo -e "${GREEN}☁️  Nimbus Cloud${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "GPU Instance (A100)" "CLD-GPU-A100" 2.50 1 0
    return 0
  elif [[ "$lower" == *"database"* ]] || [[ "$lower" == *"postgres"* ]]; then
    echo -e "${GREEN}☁️  Nimbus Cloud${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Managed PostgreSQL" "CLD-DB-PG" 125.00 1 0
    return 0
  elif [[ "$lower" == *"server"* ]] || [[ "$lower" == *"vm"* ]] || [[ "$lower" == *"cloud"* ]] || [[ "$lower" == *"hosting"* ]]; then
    echo -e "${GREEN}☁️  Nimbus Cloud${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Standard VM Instance" "CLD-VM-STD" 75.00 1 0
    return 0
  fi
  return 1
}

# Process a session with travel matching
process_travel() {
  local session_id=$1
  local intent=$2
  local beacon_id=$BEACON_ID_TRAVEL

  [ -z "$beacon_id" ] && return 1

  local lower=$(echo "$intent" | tr '[:upper:]' '[:lower:]')

  if [[ "$lower" == *"flight"* ]] || [[ "$lower" == *"fly"* ]]; then
    echo -e "${RED}✈️  Wanderlust${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Round-trip Economy Flight" "TRV-FLT-ECO" 350.00 1 14
    return 0
  elif [[ "$lower" == *"hotel"* ]] || [[ "$lower" == *"stay"* ]]; then
    echo -e "${RED}✈️  Wanderlust${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Standard Hotel Room" "TRV-HTL-STD" 149.00 3 14
    return 0
  elif [[ "$lower" == *"travel"* ]] || [[ "$lower" == *"vacation"* ]] || [[ "$lower" == *"trip"* ]]; then
    echo -e "${RED}✈️  Wanderlust${NC} responding to: \"${intent:0:50}...\""
    submit_offer "$session_id" "$beacon_id" "Vacation Package" "TRV-PKG-ALL" 1899.00 1 30
    return 0
  fi
  return 1
}

# Poll for sessions and process them
poll_sessions() {
  local response=$(curl -s "${CORE_URL}/beacons/sessions")

  # Parse sessions
  echo "$response" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for s in d.get('sessions', []):
        sid = s.get('sessionId', '')
        intent = (s.get('intent', {}).get('raw', '') or '').replace('|', ' ')
        if sid:
            print(sid + '|' + intent)
except:
    pass
" 2>/dev/null | while IFS='|' read -r session_id intent; do
    [ -z "$session_id" ] && continue

    # Skip already-seen sessions
    if is_seen "$session_id"; then
      continue
    fi
    mark_seen "$session_id"

    echo ""

    # Try each active beacon
    process_widgets "$session_id" "$intent"
    process_electronics "$session_id" "$intent"
    process_office "$session_id" "$intent"
    process_cloud "$session_id" "$intent"
    process_travel "$session_id" "$intent"
  done
}

# List available beacons
list_beacons() {
  echo ""
  echo "Available Beacons:"
  echo ""
  echo "  widgets      🏭 Acme Widget Co.        (widget, industrial)"
  echo "  electronics  💻 TechMart Electronics   (laptop, computer, monitor)"
  echo "  office       📎 OfficeMax Pro          (desk, chair, paper)"
  echo "  cloud        ☁️  Nimbus Cloud Services  (server, vm, database, gpu)"
  echo "  travel       ✈️  Wanderlust Travel      (flight, hotel, vacation)"
  echo ""
  echo "Usage:"
  echo "  ./scripts/run-beacons.sh           # Run all beacons"
  echo "  ./scripts/run-beacons.sh widgets   # Run specific beacon"
  echo "  ./scripts/run-beacons.sh widgets electronics  # Run multiple"
  echo ""
}

# Main
main() {
  local beacon_arg=$1

  if [ "$beacon_arg" == "list" ] || [ "$beacon_arg" == "-h" ] || [ "$beacon_arg" == "--help" ]; then
    list_beacons
    exit 0
  fi

  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════════════╗"
  echo "║                                                                           ║"
  echo "║     🔥 AURA Beacon Runner (Bash Edition)                                  ║"
  echo "║                                                                           ║"
  echo "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Core URL: $CORE_URL"
  echo "Poll Interval: ${POLL_INTERVAL}s"
  echo ""

  # Determine which beacons to run
  local run_widgets=false
  local run_electronics=false
  local run_office=false
  local run_cloud=false
  local run_travel=false

  if [ -z "$beacon_arg" ]; then
    # Run all beacons
    run_widgets=true
    run_electronics=true
    run_office=true
    run_cloud=true
    run_travel=true
    echo "Starting all beacons..."
  else
    # Run specified beacons
    for arg in "$@"; do
      case $arg in
        widgets) run_widgets=true ;;
        electronics) run_electronics=true ;;
        office) run_office=true ;;
        cloud) run_cloud=true ;;
        travel) run_travel=true ;;
        *)
          echo -e "${RED}Unknown beacon: $arg${NC}"
          list_beacons
          exit 1 ;;
      esac
    done
    echo "Starting beacons: $@"
  fi

  echo ""

  # Register beacons
  if [ "$run_widgets" = true ]; then
    BEACON_ID_WIDGETS=$(register_beacon "acme-widgets-001" "Acme Widget Co." "Industrial widgets")
    if [ -n "$BEACON_ID_WIDGETS" ]; then
      echo -e "${GREEN}✅ Registered:${NC} Acme Widget Co. ($BEACON_ID_WIDGETS)"
    else
      echo -e "${RED}❌ Failed to register:${NC} Acme Widget Co."
    fi
  fi

  if [ "$run_electronics" = true ]; then
    BEACON_ID_ELECTRONICS=$(register_beacon "techmart-electronics-001" "TechMart Electronics" "Laptops, monitors, accessories")
    if [ -n "$BEACON_ID_ELECTRONICS" ]; then
      echo -e "${GREEN}✅ Registered:${NC} TechMart Electronics ($BEACON_ID_ELECTRONICS)"
    else
      echo -e "${RED}❌ Failed to register:${NC} TechMart Electronics"
    fi
  fi

  if [ "$run_office" = true ]; then
    BEACON_ID_OFFICE=$(register_beacon "officemax-pro-001" "OfficeMax Pro" "Office furniture and supplies")
    if [ -n "$BEACON_ID_OFFICE" ]; then
      echo -e "${GREEN}✅ Registered:${NC} OfficeMax Pro ($BEACON_ID_OFFICE)"
    else
      echo -e "${RED}❌ Failed to register:${NC} OfficeMax Pro"
    fi
  fi

  if [ "$run_cloud" = true ]; then
    BEACON_ID_CLOUD=$(register_beacon "nimbus-cloud-001" "Nimbus Cloud Services" "Cloud infrastructure")
    if [ -n "$BEACON_ID_CLOUD" ]; then
      echo -e "${GREEN}✅ Registered:${NC} Nimbus Cloud Services ($BEACON_ID_CLOUD)"
    else
      echo -e "${RED}❌ Failed to register:${NC} Nimbus Cloud Services"
    fi
  fi

  if [ "$run_travel" = true ]; then
    BEACON_ID_TRAVEL=$(register_beacon "wanderlust-travel-001" "Wanderlust Travel" "Flights, hotels, packages")
    if [ -n "$BEACON_ID_TRAVEL" ]; then
      echo -e "${GREEN}✅ Registered:${NC} Wanderlust Travel ($BEACON_ID_TRAVEL)"
    else
      echo -e "${RED}❌ Failed to register:${NC} Wanderlust Travel"
    fi
  fi

  echo ""
  echo "─────────────────────────────────────────────────────────────────────────────"
  echo ""
  echo "🔄 Polling for sessions every ${POLL_INTERVAL}s..."
  echo "   Press Ctrl+C to stop"
  echo ""
  echo "Try creating sessions with intents like:"
  echo "  • \"I need 500 industrial widgets\""
  echo "  • \"Looking for 10 laptops for our team\""
  echo "  • \"Need standing desks for new office\""
  echo "  • \"Spin up 5 VMs for production\""
  echo "  • \"Book a flight to New York\""
  echo ""
  echo "─────────────────────────────────────────────────────────────────────────────"

  # Polling loop
  trap 'echo -e "\n\n🛑 Shutting down..."; exit 0' INT

  while true; do
    poll_sessions
    sleep $POLL_INTERVAL
  done
}

main "$@"
