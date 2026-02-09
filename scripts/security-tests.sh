#!/bin/bash

#
# AURA Security Tests (Bash + curl)
#
# Runs security tests against the deployed API.
# No local dependencies required - just curl and python3.
#
# Usage:
#   ./scripts/security-tests.sh                    # Run all tests
#   ./scripts/security-tests.sh --quick            # Run quick tests only
#   AURA_CORE_URL=http://localhost:3000 ./scripts/security-tests.sh
#

set -uo pipefail
# Note: not using -e so tests can fail without stopping the script

CORE_URL="${AURA_CORE_URL:-https://aura-labsai-production.up.railway.app}"
QUICK_MODE="${1:-}"
OUTPUT_FILE="${SECURITY_TEST_OUTPUT:-/tmp/aura-security-tests.txt}"

# Redirect all output to file and stdout
exec > >(tee "$OUTPUT_FILE") 2>&1

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test counters
PASSED=0
FAILED=0
SKIPPED=0

# Test result tracking
declare -a FAILURES

# Helper: Make HTTP request and return status + body
http_request() {
  local method=$1
  local path=$2
  local body=${3:-}
  local headers=${4:-}

  local curl_args=(-s -w "\n%{http_code}" -X "$method")

  if [ -n "$headers" ]; then
    curl_args+=(-H "$headers")
  fi

  curl_args+=(-H "Content-Type: application/json")

  if [ -n "$body" ]; then
    curl_args+=(-d "$body")
  fi

  curl "${curl_args[@]}" "${CORE_URL}${path}" 2>/dev/null || echo -e "\n000"
}

# Helper: Extract status code from response
get_status() {
  echo "$1" | tail -1
}

# Helper: Extract body from response
get_body() {
  echo "$1" | sed '$d'
}

# Helper: Check if body contains string
body_contains() {
  local body=$1
  local needle=$2
  echo "$body" | grep -q "$needle"
}

# Test assertion functions
assert_status() {
  local actual=$1
  local expected=$2
  local test_name=$3

  if [ "$actual" -eq "$expected" ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: $test_name (expected $expected, got $actual)"
    ((FAILED++))
    FAILURES+=("$test_name: expected status $expected, got $actual")
  fi
  return 0  # Always continue
}

assert_status_one_of() {
  local actual=$1
  local test_name=$2
  shift 2
  local expected=("$@")

  for exp in "${expected[@]}"; do
    if [ "$actual" -eq "$exp" ]; then
      echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
      ((PASSED++))
      return 0
    fi
  done

  echo -e "  ${RED}❌ FAIL${NC}: $test_name (got $actual, expected one of: ${expected[*]})"
  ((FAILED++))
  FAILURES+=("$test_name: got $actual, expected one of: ${expected[*]}")
  return 0  # Always continue
}

assert_not_status() {
  local actual=$1
  local unexpected=$2
  local test_name=$3

  if [ "$actual" -ne "$unexpected" ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: $test_name (should NOT be $unexpected)"
    ((FAILED++))
    FAILURES+=("$test_name: should not be $unexpected")
  fi
  return 0  # Always return success to continue tests
}

assert_body_not_contains() {
  local body=$1
  local needle=$2
  local test_name=$3

  if ! echo "$body" | grep -qi "$needle"; then
    echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: $test_name (body contains '$needle')"
    ((FAILED++))
    FAILURES+=("$test_name: body should not contain '$needle'")
  fi
  return 0  # Always continue
}

skip_test() {
  local test_name=$1
  local reason=$2
  echo -e "  ${YELLOW}⏭️  SKIP${NC}: $test_name ($reason)"
  ((SKIPPED++))
}

# =============================================================================
# Test Suites
# =============================================================================

test_sql_injection() {
  echo -e "\n${CYAN}🔍 SQL Injection Prevention${NC}"

  # Test 1: SQL injection in session ID
  local response=$(http_request GET "/sessions/'; DROP TABLE sessions; --")
  local status=$(get_status "$response")
  local body=$(get_body "$response")
  assert_not_status "$status" 500 "Session ID SQL injection should not cause 500"
  assert_body_not_contains "$body" "syntax error" "Should not expose SQL errors"

  # Test 2: SQL injection in beacon ID
  response=$(http_request GET "/beacons/' UNION SELECT * FROM scouts --")
  status=$(get_status "$response")
  assert_not_status "$status" 500 "Beacon ID SQL injection should not cause 500"

  # Test 3: SQL injection in scout ID
  response=$(http_request GET "/scouts/' OR '1'='1")
  status=$(get_status "$response")
  assert_not_status "$status" 500 "Scout ID SQL injection should not cause 500"

  # Test 4: SQL injection in offer submission
  response=$(http_request POST "/sessions/test-session/offers" \
    '{"beaconId":"'"'"'; DROP TABLE offers; --","product":{"name":"test"},"unitPrice":100,"quantity":1}')
  status=$(get_status "$response")
  body=$(get_body "$response")
  assert_not_status "$status" 500 "Offer SQL injection should not cause 500"
}

test_authentication() {
  echo -e "\n${CYAN}🔐 Authentication Tests${NC}"

  # Test 1: Session creation without auth
  local response=$(http_request POST "/sessions" '{"intent":"test"}')
  local status=$(get_status "$response")
  # Currently FAILS - no auth implemented
  if [ "$status" -eq 401 ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: Session creation requires authentication"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: Session creation should require auth (got $status, expected 401)"
    ((FAILED++))
    FAILURES+=("Session creation should require authentication")
  fi

  # Test 2: Offer submission without auth
  response=$(http_request POST "/sessions/test/offers" \
    '{"beaconId":"test","product":{"name":"test"},"unitPrice":100,"quantity":1}')
  status=$(get_status "$response")
  if [ "$status" -eq 401 ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: Offer submission requires authentication"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: Offer submission should require auth (got $status, expected 401)"
    ((FAILED++))
    FAILURES+=("Offer submission should require authentication")
  fi

  # Test 3: Commit without auth
  response=$(http_request POST "/sessions/test/commit" '{"offerId":"test"}')
  status=$(get_status "$response")
  if [ "$status" -eq 401 ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: Transaction commit requires authentication"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: Transaction commit should require auth (got $status, expected 401)"
    ((FAILED++))
    FAILURES+=("Transaction commit should require authentication")
  fi
}

test_admin_endpoint() {
  echo -e "\n${CYAN}⚠️  Admin Endpoint Security${NC}"

  # Test 1: Admin endpoint without auth
  local response=$(http_request POST "/admin/reset-database" '{"confirm":"yes-delete-everything"}')
  local status=$(get_status "$response")

  # This SHOULD require auth (401) or be disabled (404)
  if [ "$status" -eq 401 ] || [ "$status" -eq 404 ] || [ "$status" -eq 403 ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: Admin endpoint is protected"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: Admin endpoint should be protected (got $status)"
    ((FAILED++))
    FAILURES+=("CRITICAL: Admin endpoint is unprotected!")
  fi
}

test_rate_limiting() {
  echo -e "\n${CYAN}🚦 Rate Limiting${NC}"

  # Send 20 rapid requests
  local rate_limited=0
  for i in {1..20}; do
    local response=$(http_request GET "/health")
    local status=$(get_status "$response")
    if [ "$status" -eq 429 ]; then
      ((rate_limited++))
    fi
  done

  if [ "$rate_limited" -gt 0 ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: Rate limiting is active ($rate_limited/20 limited)"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: No rate limiting detected"
    ((FAILED++))
    FAILURES+=("Rate limiting not implemented")
  fi
}

test_input_validation() {
  echo -e "\n${CYAN}📝 Input Validation${NC}"

  # Test 1: Missing required field
  local response=$(http_request POST "/sessions" '{}')
  local status=$(get_status "$response")
  assert_status "$status" 400 "Should reject missing intent field"

  # Test 2: Oversized payload (1MB of data)
  local large_payload='{"intent":"'$(python3 -c "print('x' * 1048576)")'"}'
  response=$(http_request POST "/sessions" "$large_payload")
  status=$(get_status "$response")
  assert_status_one_of "$status" "Should reject oversized payload" 400 413

  # Test 3: Invalid beacon registration (missing name)
  response=$(http_request POST "/beacons/register" '{"externalId":"test"}')
  status=$(get_status "$response")
  assert_status "$status" 400 "Should require beacon name"

  # Test 4: Negative price
  response=$(http_request POST "/sessions/test/offers" \
    '{"beaconId":"test","product":{"name":"test"},"unitPrice":-100,"quantity":1}')
  status=$(get_status "$response")
  # Should be 400 for invalid price
  if [ "$status" -eq 400 ]; then
    echo -e "  ${GREEN}✅ PASS${NC}: Should reject negative price"
    ((PASSED++))
  else
    echo -e "  ${RED}❌ FAIL${NC}: Should reject negative price (got $status)"
    ((FAILED++))
    FAILURES+=("Should validate offer price is positive")
  fi
}

test_cors() {
  echo -e "\n${CYAN}🌐 CORS Configuration${NC}"

  # Test with malicious origin
  local response=$(curl -s -w "\n%{http_code}" -H "Origin: https://malicious-site.com" "${CORE_URL}/health")
  local status=$(get_status "$response")
  local headers=$(curl -sI -H "Origin: https://malicious-site.com" "${CORE_URL}/health" 2>/dev/null)

  # Check Access-Control-Allow-Origin header
  local allowed_origin=$(echo "$headers" | grep -i "access-control-allow-origin" | cut -d: -f2 | tr -d ' \r')

  if [ "$allowed_origin" = "*" ]; then
    echo -e "  ${RED}❌ FAIL${NC}: CORS allows all origins (Access-Control-Allow-Origin: *)"
    ((FAILED++))
    FAILURES+=("CORS should not allow all origins")
  elif [ "$allowed_origin" = "https://malicious-site.com" ]; then
    echo -e "  ${RED}❌ FAIL${NC}: CORS reflects arbitrary origin"
    ((FAILED++))
    FAILURES+=("CORS should not reflect arbitrary origins")
  else
    echo -e "  ${GREEN}✅ PASS${NC}: CORS does not allow arbitrary origins"
    ((PASSED++))
  fi
}

test_information_disclosure() {
  echo -e "\n${CYAN}🔒 Information Disclosure Prevention${NC}"

  # Test 1: Stack traces in errors
  local response=$(http_request GET "/sessions/invalid-id-format")
  local body=$(get_body "$response")
  assert_body_not_contains "$body" "at " "Should not expose stack traces"
  assert_body_not_contains "$body" ".js:" "Should not expose file paths"

  # Test 2: Database errors
  response=$(http_request GET "/sessions/'; SELECT 1; --")
  body=$(get_body "$response")
  assert_body_not_contains "$body" "postgres" "Should not expose database type"
  assert_body_not_contains "$body" "syntax" "Should not expose SQL errors"

  # Test 3: Internal paths
  response=$(http_request GET "/nonexistent-path")
  body=$(get_body "$response")
  assert_body_not_contains "$body" "/usr/" "Should not expose internal paths"
  assert_body_not_contains "$body" "node_modules" "Should not expose node_modules"
}

test_uuid_validation() {
  echo -e "\n${CYAN}🆔 UUID Validation${NC}"

  local invalid_ids=("not-a-uuid" "12345" "abc" "" "null" "undefined")

  for id in "${invalid_ids[@]}"; do
    local response=$(http_request GET "/sessions/$id")
    local status=$(get_status "$response")
    if [ "$status" -eq 400 ]; then
      echo -e "  ${GREEN}✅ PASS${NC}: Rejects invalid ID: '$id'"
      ((PASSED++))
    else
      echo -e "  ${RED}❌ FAIL${NC}: Should reject invalid ID: '$id' (got $status)"
      ((FAILED++))
      FAILURES+=("Should validate UUID format for ID: $id")
    fi
  done
}

# =============================================================================
# Main
# =============================================================================

main() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════════════╗"
  echo "║                                                                           ║"
  echo "║     🔐 AURA Security Tests                                                ║"
  echo "║                                                                           ║"
  echo "╚═══════════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Target: $CORE_URL"
  echo ""

  # Run test suites
  test_sql_injection
  test_authentication
  test_admin_endpoint

  if [ "$QUICK_MODE" != "--quick" ]; then
    test_rate_limiting
    test_input_validation
    test_cors
    test_information_disclosure
    test_uuid_validation
  fi

  # Summary
  echo ""
  echo "═══════════════════════════════════════════════════════════════════════════"
  echo ""

  local total=$((PASSED + FAILED + SKIPPED))
  echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, ${YELLOW}$SKIPPED skipped${NC} (total: $total)"
  echo ""

  if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Failed Tests:${NC}"
    for failure in "${FAILURES[@]}"; do
      echo "  • $failure"
    done
    echo ""
  fi

  if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All security tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}❌ Security vulnerabilities detected!${NC}"
    echo ""
    echo "See SECURITY_AUDIT_REPORT.md for remediation guidance."
    exit 1
  fi
}

main
