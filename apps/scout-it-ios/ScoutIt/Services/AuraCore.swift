import Foundation

/// AURA Core API client
class AuraCore {
    static let shared = AuraCore()

    #if DEBUG
    static let baseURL = "https://aura-labsai-production.up.railway.app"
    #else
    static let baseURL = "https://aura-labsai-production.up.railway.app"
    #endif

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Health Check

    /// Check API health
    func healthCheck() async throws -> HealthResponse {
        let url = URL(string: "\(Self.baseURL)/health")!
        let (data, _) = try await session.data(from: url)
        return try decoder.decode(HealthResponse.self, from: data)
    }

    // MARK: - Sessions

    /// Create a new shopping session
    func createSession(intent: String, constraints: Constraints, agentId: String) async throws -> Session {
        let url = URL(string: "\(Self.baseURL)/sessions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = CreateSessionRequest(
            intent: intent,
            constraints: constraints,
            agentId: agentId
        )
        request.httpBody = try encoder.encode(body)

        #if DEBUG
        if let bodyJson = String(data: request.httpBody!, encoding: .utf8) {
            print("📤 Request to /sessions: \(bodyJson)")
        }
        #endif

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuraError.invalidResponse
        }

        #if DEBUG
        print("📥 Response status: \(httpResponse.statusCode)")
        if let rawResponse = String(data: data, encoding: .utf8) {
            print("📥 Response body: \(rawResponse)")
        }
        #endif

        guard httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            throw AuraError.httpError(httpResponse.statusCode)
        }

        do {
            let sessionResponse = try decoder.decode(SessionResponse.self, from: data)
            return sessionResponse.session
        } catch {
            print("❌ Decoding error: \(error)")
            throw AuraError.decodingError(error)
        }
    }

    /// Get session by ID
    func getSession(id: String) async throws -> Session {
        let url = URL(string: "\(Self.baseURL)/sessions/\(id)")!
        let (data, response) = try await session.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuraError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw AuraError.httpError(httpResponse.statusCode)
        }

        let sessionResponse = try decoder.decode(SessionResponse.self, from: data)
        return sessionResponse.session
    }

    /// Approve an offer and create cart mandate
    func approveOffer(
        sessionId: String,
        offerId: String,
        intentMandateRef: String,
        userId: String
    ) async throws -> Session {
        let url = URL(string: "\(Self.baseURL)/sessions/\(sessionId)/approve")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ApproveOfferRequest(
            offerId: offerId,
            cartMandate: CartMandateData(
                intentMandateRef: intentMandateRef,
                userId: userId
            )
        )
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuraError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw AuraError.httpError(httpResponse.statusCode)
        }

        let sessionResponse = try decoder.decode(SessionResponse.self, from: data)
        return sessionResponse.session
    }

    // MARK: - Checkout

    /// Complete checkout with payment mandate
    func checkout(
        sessionId: String,
        paymentMandate: PaymentMandate,
        tapSignedHeaders: [String: String]
    ) async throws -> CheckoutResponse {
        let url = URL(string: "\(Self.baseURL)/checkout")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add TAP signature headers
        for (key, value) in tapSignedHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let body = CheckoutRequest(
            sessionId: sessionId,
            paymentMandate: paymentMandate
        )
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuraError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw AuraError.httpError(httpResponse.statusCode)
        }

        return try decoder.decode(CheckoutResponse.self, from: data)
    }
}

// MARK: - Request/Response Types

struct HealthResponse: Codable {
    let status: String
    let timestamp: String
    let version: String?
}

struct CheckoutRequest: Codable {
    let sessionId: String
    let paymentMandate: PaymentMandate
}

struct CheckoutResponse: Codable {
    let success: Bool
    let orderId: String
    let transactionId: String
    let timestamp: String
    let auditTrail: AuditTrail?
}

struct AuditTrail: Codable {
    let intentMandateId: String
    let cartMandateId: String
    let paymentMandateId: String
    let tapAgentId: String
}

// MARK: - Errors

enum AuraError: Error, LocalizedError {
    case invalidResponse
    case httpError(Int)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}
