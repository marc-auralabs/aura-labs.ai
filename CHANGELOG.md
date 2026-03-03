# Changelog

All notable changes to the AURA Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Beacon Merchant Integration Hooks** (DEC-010)
  - `beforeOffer(validator)` — pre-offer validation middleware for inventory checks, price enforcement
  - `onOfferAccepted(handler)` — handler for committed transactions
  - `onTransactionUpdate(handler)` — handler for transaction status changes
  - `registerPolicies(policies)` — declarative business rules (minPrice, maxQuantityPerOrder, maxDeliveryDays, deliveryRegions)
  - `updateFulfillment(transactionId, update)` — report shipping/delivery to Core
  - `getTransaction(transactionId)` — fetch transaction details
  - `ValidationError` class for blocked offers

- **Transaction Lifecycle Endpoints**
  - `GET /transactions/:transactionId` — full transaction details with HATEOAS links
  - `PUT /transactions/:transactionId/fulfillment` — update fulfillment status (shipped, delivered)
  - `PUT /transactions/:transactionId/payment` — update payment status (pending, charged, failed, refunded)
  - Auto-transitions: `committed` → `fulfilled` (on delivery), `fulfilled` → `completed` (on payment + delivery)
  - Audit log entries for all state changes

- **Webhook Dispatcher**
  - Fire-and-forget webhook delivery to beacon `endpointUrl`
  - 3 retries with exponential backoff (1s, 2s, 4s)
  - Events: `transaction.committed`, `fulfillment.updated`, `payment.updated`

- **Scout SDK Enhancements**
  - `Transaction.refresh()` — poll transaction status
  - `Transaction.waitForFulfillment(options)` — wait for delivery with timeout
  - `Transaction.beacon` getter — access beacon info from transaction

- **Demo Script** (`demo.sh`)
  - Full end-to-end commerce flow walkthrough
  - Step 7: post-transaction lifecycle (ship → deliver → pay → completed)

### Documentation
- Rewrote Beacon SDK README with complete API reference and integration hooks
- Rewrote docs/beacon/README.md with correct SDK patterns (was using obsolete event-driven API)
- Rewrote docs/api/README.md with actual REST endpoints (was describing non-existent WebSocket API)
- Wrote docs/tutorials/beacon-transactions.md (replaced stub)
- Updated docs/integration-guides/README.md with correct SDK patterns

## [1.1.0] - 2026-02-24

### Added
- **Ed25519 Agent Identity** (DEC-009)
  - Universal cryptographic identity for all agents (Scouts and Beacons)
  - `POST /agents/register` with proof-of-possession signature
  - Request signing for integrity verification
  - Agent revocation support
  - 114 tests passing

- **Core API Consolidation**
  - Intent parser with NLP extraction (quantity, price, delivery, features)
  - Beacon matcher with scoring algorithm
  - Session state machine (market_forming → committed → cancelled)
  - Offer submission and commitment flow

- Initial public release of AURA Framework
- Simple Beacon reference implementation
- Core protocol specification v1.0
- JSON schemas for all message types
- Comprehensive documentation

### Documentation
- Architecture overview
- Protocol specification
- Quickstart guide
- API reference
- Integration guides

## [1.0.0] - 2026-02-01

### Added
- **AURA Core Protocol v1.0**
  - Intent registration
  - Proposition matching
  - Negotiation protocol
  - Transaction handling

- **Simple Beacon**
  - Reference implementation in JavaScript
  - Dynamic pricing engine
  - Inventory management
  - Transaction processing

- **JSON Schemas**
  - Scout message schemas
  - Beacon message schemas
  - Transaction schemas
  - Shared data structures

- **Documentation**
  - Complete protocol specification
  - Architecture documentation
  - Component registry
  - Neutral broker architecture
  - Reputation system specification

### Security
- TLS 1.3 required for all connections
- JWT-based authentication
- Rate limiting per client

## [0.9.0] - 2025-12-15 (Beta)

### Added
- Beta release for early adopters
- Core protocol implementation
- Basic Beacon functionality

### Changed
- Refined negotiation protocol
- Updated message schemas

### Fixed
- WebSocket reconnection handling
- Rate limiting edge cases

## Roadmap

### Planned for v1.1.0
- Scout SDK release
- Python SDK
- Enhanced analytics

### Planned for v1.2.0
- Multi-language support (Go)
- Advanced negotiation protocols
- Federation support

### Future
- Blockchain integration for trust
- Federated learning for preferences
- Mobile SDKs

---

## Version History

| Version | Date | Status |
|---------|------|--------|
| 1.0.0 | 2026-02-01 | Current |
| 0.9.0 | 2025-12-15 | Beta |

## Upgrade Guides

For major version upgrades, see the [Migration Guide](./docs/migration.md).

## Reporting Issues

Found a bug? Please [open an issue](https://github.com/aura-labs/aura-framework/issues) with:
- Version number
- Steps to reproduce
- Expected vs actual behavior
