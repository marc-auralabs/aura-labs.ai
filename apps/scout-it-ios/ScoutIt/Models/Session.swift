import Foundation

/// Shopping session state
struct Session: Codable, Identifiable {
    let id: String
    let status: SessionStatus
    let intent: String?  // Extracted from intent.raw
    let intentDetails: IntentDetails?
    let constraints: Constraints?
    let offers: [Offer]
    let selectedOfferId: String?
    let createdAt: String?

    enum SessionStatus: String, Codable {
        case pending
        case searching
        case marketForming = "market_forming"
        case offersReady = "offers_ready"
        case approved
        case completed
        case failed

        // Handle unknown status values gracefully
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            self = SessionStatus(rawValue: value) ?? .pending
        }
    }

    enum CodingKeys: String, CodingKey {
        case sessionId
        case id
        case status
        case intent
        case constraints
        case offers
        case selectedOfferId = "selected_offer_id"
        case createdAt = "created_at"
    }

    // Custom decoder to handle the actual API response format
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        // Handle both "sessionId" and "id" field names
        if let sessionId = try container.decodeIfPresent(String.self, forKey: .sessionId) {
            id = sessionId
        } else if let idValue = try container.decodeIfPresent(String.self, forKey: .id) {
            id = idValue
        } else {
            throw DecodingError.keyNotFound(CodingKeys.id, DecodingError.Context(
                codingPath: container.codingPath,
                debugDescription: "Neither 'sessionId' nor 'id' found"
            ))
        }

        status = try container.decodeIfPresent(SessionStatus.self, forKey: .status) ?? .pending

        // Handle intent as either a string or an object with "raw" field
        if let intentString = try? container.decode(String.self, forKey: .intent) {
            intent = intentString
            intentDetails = nil
        } else if let intentObj = try? container.decode(IntentDetails.self, forKey: .intent) {
            intent = intentObj.raw
            intentDetails = intentObj
        } else {
            intent = nil
            intentDetails = nil
        }

        constraints = try container.decodeIfPresent(Constraints.self, forKey: .constraints)
        offers = try container.decodeIfPresent([Offer].self, forKey: .offers) ?? []
        selectedOfferId = try container.decodeIfPresent(String.self, forKey: .selectedOfferId)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

/// Intent details as returned by the API
struct IntentDetails: Codable {
    let raw: String?
    let keywords: [String]?
    let confidence: Double?
}

/// Purchase constraints defined by user
struct Constraints: Codable {
    var maxAmount: Decimal
    var currency: String
    var categories: [String]
    var merchantAllowlist: [String]?
    var merchantBlocklist: [String]?
    var deliveryBefore: Date?

    enum CodingKeys: String, CodingKey {
        case maxAmount = "max_amount"
        case currency
        case categories
        case merchantAllowlist = "merchant_allowlist"
        case merchantBlocklist = "merchant_blocklist"
        case deliveryBefore = "delivery_before"
    }

    init(
        maxAmount: Decimal = 1000,
        currency: String = "USD",
        categories: [String] = [],
        merchantAllowlist: [String]? = nil,
        merchantBlocklist: [String]? = nil,
        deliveryBefore: Date? = nil
    ) {
        self.maxAmount = maxAmount
        self.currency = currency
        self.categories = categories
        self.merchantAllowlist = merchantAllowlist
        self.merchantBlocklist = merchantBlocklist
        self.deliveryBefore = deliveryBefore
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        // Handle maxAmount as either number or string
        if let decimalValue = try? container.decode(Decimal.self, forKey: .maxAmount) {
            maxAmount = decimalValue
        } else if let doubleValue = try? container.decode(Double.self, forKey: .maxAmount) {
            maxAmount = Decimal(doubleValue)
        } else if let intValue = try? container.decode(Int.self, forKey: .maxAmount) {
            maxAmount = Decimal(intValue)
        } else {
            maxAmount = 1000
        }

        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? "USD"
        categories = try container.decodeIfPresent([String].self, forKey: .categories) ?? []
        merchantAllowlist = try container.decodeIfPresent([String].self, forKey: .merchantAllowlist)
        merchantBlocklist = try container.decodeIfPresent([String].self, forKey: .merchantBlocklist)
        deliveryBefore = try container.decodeIfPresent(Date.self, forKey: .deliveryBefore)
    }
}

/// API response wrapper - handles both { session: {...} } and direct session object
struct SessionResponse: Codable {
    let session: Session

    init(from decoder: Decoder) throws {
        // Try to decode as wrapped response first
        if let container = try? decoder.container(keyedBy: CodingKeys.self),
           let session = try? container.decode(Session.self, forKey: .session) {
            self.session = session
        } else {
            // Fall back to decoding as direct session object
            self.session = try Session(from: decoder)
        }
    }

    enum CodingKeys: String, CodingKey {
        case session
    }
}

/// Create session request
struct CreateSessionRequest: Codable {
    let intent: String
    let constraints: Constraints
    let agentId: String

    enum CodingKeys: String, CodingKey {
        case intent
        case constraints
        case agentId = "agent_id"
    }
}

/// Approve offer request
struct ApproveOfferRequest: Codable {
    let offerId: String
    let cartMandate: CartMandateData

    enum CodingKeys: String, CodingKey {
        case offerId = "offer_id"
        case cartMandate = "cart_mandate"
    }
}

struct CartMandateData: Codable {
    let intentMandateRef: String
    let userId: String

    enum CodingKeys: String, CodingKey {
        case intentMandateRef = "intent_mandate_ref"
        case userId = "user_id"
    }
}
