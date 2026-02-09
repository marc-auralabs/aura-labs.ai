import Foundation

/// Shopping session state
struct Session: Codable, Identifiable {
    let id: String
    let status: SessionStatus
    let intent: String
    let constraints: Constraints
    let offers: [Offer]
    let selectedOfferId: String?
    let createdAt: Date

    enum SessionStatus: String, Codable {
        case pending
        case searching
        case offersReady = "offers_ready"
        case approved
        case completed
        case failed
    }
}

/// Purchase constraints defined by user
struct Constraints: Codable {
    var maxAmount: Decimal
    var currency: String
    var categories: [String]
    var merchantAllowlist: [String]?
    var merchantBlocklist: [String]?
    var deliveryBefore: Date?

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
}

/// API response wrapper
struct SessionResponse: Codable {
    let session: Session
}

/// Create session request
struct CreateSessionRequest: Codable {
    let intent: String
    let constraints: Constraints
    let agentId: String
}

/// Approve offer request
struct ApproveOfferRequest: Codable {
    let offerId: String
    let cartMandate: CartMandateData
}

struct CartMandateData: Codable {
    let intentMandateRef: String
    let userId: String
}
