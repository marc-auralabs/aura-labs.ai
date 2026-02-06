# Changelog

All notable changes to the AURA Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
