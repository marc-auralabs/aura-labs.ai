import Foundation

// MARK: - Common Types

/// Party involved in a mandate (issuer or subject)
struct MandateParty: Codable {
    let type: String  // "user" or "agent"
    let id: String
}

/// Cryptographic proof attached to mandates
struct MandateProof: Codable {
    let type: String
    let created: String
    let verificationMethod: String
    let proofPurpose: String
    let proofValue: String
}

// MARK: - Intent Mandate

/// AP2 Intent Mandate - User's authorization for agent to shop
struct IntentMandate: Codable, Identifiable {
    let id: String
    let type: String  // "intent"
    let version: String
    let issuedAt: String
    let issuer: MandateParty
    let subject: MandateParty
    let constraints: MandateConstraints
    let metadata: MandateMetadata?
    let proof: MandateProof

    struct MandateConstraints: Codable {
        let maxAmount: Decimal
        let currency: String
        let categories: [String]?
        let merchantAllowlist: [String]?
        let merchantBlocklist: [String]?
        let validUntil: String?
    }

    struct MandateMetadata: Codable {
        let purpose: String?
        let tapRegistration: String?
    }
}

// MARK: - Cart Mandate

/// AP2 Cart Mandate - User approves specific offer
struct CartMandate: Codable, Identifiable {
    let id: String
    let type: String  // "cart"
    let version: String
    let issuedAt: String
    let intentMandateRef: String
    let sessionId: String
    let issuer: MandateParty
    let cart: CartDetails
    let expiresAt: String
    let proof: MandateProof
}

/// Cart details within cart mandate
struct CartDetails: Codable {
    let offerId: String
    let beaconId: String
    let beaconName: String
    let product: CartProduct
    let totalAmount: Decimal
    let currency: String
}

struct CartProduct: Codable {
    let name: String
    let sku: String?
    let quantity: Int
    let unitPrice: Decimal
}

// MARK: - Payment Mandate

/// AP2 Payment Mandate - Agent authorized to execute payment
struct PaymentMandate: Codable, Identifiable {
    let id: String
    let type: String  // "payment"
    let version: String
    let issuedAt: String
    let cartMandateRef: String
    let issuer: MandateParty
    let agent: AgentInfo
    let paymentMethod: PaymentMethod
    let transaction: Transaction
    let riskSignals: RiskSignals
    let proof: MandateProof
}

/// Agent information in payment mandate
struct AgentInfo: Codable {
    let id: String
    let tapId: String
}

/// Payment method details
struct PaymentMethod: Codable {
    let type: String  // "card"
    let network: String  // "visa"
    let tokenized: Bool
}

/// Transaction details
struct Transaction: Codable {
    let amount: Decimal
    let currency: String
    let merchantId: String
    let merchantName: String
}

/// Risk assessment signals
struct RiskSignals: Codable {
    let intentMandatePresent: Bool
    let cartMandatePresent: Bool
    let constraintsValid: Bool
    let amountWithinLimit: Bool
}

// MARK: - Mandate Chain

/// Complete mandate chain for audit trail
struct MandateChain {
    var intentMandate: IntentMandate?
    var cartMandate: CartMandate?
    var paymentMandate: PaymentMandate?

    var isComplete: Bool {
        intentMandate != nil && cartMandate != nil && paymentMandate != nil
    }

    var currentStep: MandateStep {
        if paymentMandate != nil { return .payment }
        if cartMandate != nil { return .cart }
        if intentMandate != nil { return .intent }
        return .none
    }

    enum MandateStep: Int, CaseIterable {
        case none = 0
        case intent = 1
        case cart = 2
        case payment = 3

        var title: String {
            switch self {
            case .none: return "Not Started"
            case .intent: return "Intent Mandate"
            case .cart: return "Cart Mandate"
            case .payment: return "Payment Mandate"
            }
        }

        var description: String {
            switch self {
            case .none: return "Begin shopping"
            case .intent: return "User authorizes agent to shop"
            case .cart: return "User approves specific offer"
            case .payment: return "Agent authorized to pay"
            }
        }
    }
}
