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

    enum CodingKeys: String, CodingKey {
        case id
        case beaconId = "beacon_id"
        case beaconName = "beacon_name"
        case product
        case unitPrice = "unit_price"
        case quantity
        case totalPrice = "total_price"
        case currency
        case deliveryDate = "delivery_date"
        case terms
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        beaconId = try container.decodeIfPresent(String.self, forKey: .beaconId) ?? "unknown"
        beaconName = try container.decodeIfPresent(String.self, forKey: .beaconName) ?? "Unknown Vendor"
        product = try container.decodeIfPresent(Product.self, forKey: .product) ?? Product(name: "Product")
        quantity = try container.decodeIfPresent(Int.self, forKey: .quantity) ?? 1
        currency = try container.decodeIfPresent(String.self, forKey: .currency) ?? "USD"
        deliveryDate = try container.decodeIfPresent(String.self, forKey: .deliveryDate)
        terms = try container.decodeIfPresent(String.self, forKey: .terms)

        // Handle unitPrice as number or string
        if let decimal = try? container.decode(Decimal.self, forKey: .unitPrice) {
            unitPrice = decimal
        } else if let double = try? container.decode(Double.self, forKey: .unitPrice) {
            unitPrice = Decimal(double)
        } else {
            unitPrice = 0
        }

        // Handle totalPrice as number or string
        if let decimal = try? container.decode(Decimal.self, forKey: .totalPrice) {
            totalPrice = decimal
        } else if let double = try? container.decode(Double.self, forKey: .totalPrice) {
            totalPrice = Decimal(double)
        } else {
            totalPrice = unitPrice * Decimal(quantity)
        }
    }

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

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Product"
        sku = try container.decodeIfPresent(String.self, forKey: .sku)
        description = try container.decodeIfPresent(String.self, forKey: .description)
    }

    enum CodingKeys: String, CodingKey {
        case name
        case sku
        case description
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

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Unknown"
        category = try container.decodeIfPresent(String.self, forKey: .category)
        rating = try container.decodeIfPresent(Double.self, forKey: .rating)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified) ?? false
    }

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case category
        case rating
        case verified
    }
}
