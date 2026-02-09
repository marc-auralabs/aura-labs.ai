import Foundation

/// Offer from a Beacon vendor
struct Offer: Codable, Identifiable {
    let id: String
    let beaconId: String
    let beaconName: String
    let product: Product
    let unitPrice: Decimal
    let quantity: Int
    let totalPrice: Decimal
    let currency: String
    let deliveryDate: String?
    let terms: String?

    /// Formatted total price string
    var formattedPrice: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: totalPrice as NSDecimalNumber) ?? "$\(totalPrice)"
    }

    /// Formatted unit price string
    var formattedUnitPrice: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: unitPrice as NSDecimalNumber) ?? "$\(unitPrice)"
    }
}

/// Product details within an offer
struct Product: Codable {
    let name: String
    let sku: String?
    let description: String?

    init(name: String, sku: String? = nil, description: String? = nil) {
        self.name = name
        self.sku = sku
        self.description = description
    }
}

/// Beacon (vendor/merchant) information
struct Beacon: Codable, Identifiable {
    let id: String
    let name: String
    let category: String?
    let rating: Double?
    let verified: Bool

    init(id: String, name: String, category: String? = nil, rating: Double? = nil, verified: Bool = false) {
        self.id = id
        self.name = name
        self.category = category
        self.rating = rating
        self.verified = verified
    }
}
