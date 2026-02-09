# Scout-It! iOS App

**https://scout-it.ai**

A native SwiftUI iOS app demonstrating the AURA agentic commerce stack for AI-powered procurement.

## Features

- **Natural Language Intent Input** - Describe what you need to procure
- **Multi-Offer Comparison** - Compare offers from multiple Beacon vendors
- **AP2 Mandate Flow Visualization** - See the Intent → Cart → Payment chain
- **Visa TAP Signed Checkout** - Cryptographically signed payment requests

## Requirements

- Xcode 15.0+
- iOS 16.0+
- Swift 5.9+

## Getting Started

1. Open `ScoutIt.xcodeproj` in Xcode
2. Select your development team in Signing & Capabilities
3. Build and run on simulator or device

## Architecture

```
ScoutIt/
├── ScoutItApp.swift         # App entry point
├── ContentView.swift        # Main navigation
├── Models/                  # Data structures
│   ├── Session.swift
│   ├── Offer.swift
│   └── Mandates.swift
├── Services/                # Business logic
│   ├── AuraCore.swift       # API client
│   ├── Ed25519Signer.swift  # Cryptography
│   ├── TAPSigner.swift      # Visa TAP
│   └── KeyManager.swift     # Keychain storage
├── ViewModels/
│   └── SessionViewModel.swift
└── Views/
    ├── Intent/              # Intent input screens
    ├── Session/             # Progress & offers
    ├── Mandates/            # Mandate visualization
    └── Checkout/            # Payment & confirmation
```

## Protocols Demonstrated

### MCP (Model Context Protocol)
- Client initialization for external context aggregation
- Tool and resource discovery

### AP2 (Agent Payments Protocol)
- **Intent Mandate**: User authorizes agent to shop within constraints
- **Cart Mandate**: User approves specific offer selection
- **Payment Mandate**: Agent authorized to execute payment

### Visa TAP (Trusted Agent Protocol)
- Ed25519 key pair generation
- HTTP Message Signatures (RFC 9421)
- Agent identity verification

## API Integration

Connects to AURA Core API:
```
Base URL: https://aura-labsai-production.up.railway.app

POST /sessions        - Create shopping session
GET  /sessions/:id    - Get session status
POST /sessions/:id/approve - Approve offer
POST /checkout        - Complete purchase
```

## Demo Flow

1. **Enter Intent**: "I need 10 ergonomic keyboards under $1500"
2. **Set Constraints**: Budget, categories, delivery date
3. **Review Offers**: Compare vendor options side-by-side
4. **Approve**: Create cart mandate for selected offer
5. **Checkout**: TAP-signed payment with full audit trail
6. **Confirmation**: View complete mandate chain

## Cryptographic Implementation

Uses iOS CryptoKit for Ed25519 signatures:

```swift
import CryptoKit

let privateKey = Curve25519.Signing.PrivateKey()
let signature = try privateKey.signature(for: data)
```

Keys are stored securely in iOS Keychain via `KeyManager`.

## License

BSL-1.1 - See LICENSE in root repository
