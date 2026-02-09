import Foundation

/// Visa TAP (Trusted Agent Protocol) HTTP Message Signer
/// Implements RFC 9421 HTTP Message Signatures
class TAPSigner {
    let tapId: String
    let keyId: String
    private let signer: Ed25519Signer

    init(tapId: String, signer: Ed25519Signer, keyId: String? = nil) {
        self.tapId = tapId
        self.signer = signer
        self.keyId = keyId ?? "tap-key-\(UUID().uuidString.prefix(8))"
    }

    /// Sign a URLRequest with TAP headers
    func signRequest(_ request: URLRequest) throws -> URLRequest {
        var signedRequest = request
        let timestamp = Int(Date().timeIntervalSince1970)
        let nonce = UUID().uuidString

        // Add TAP identification headers
        signedRequest.setValue(tapId, forHTTPHeaderField: "X-TAP-Agent-Id")
        signedRequest.setValue(String(timestamp), forHTTPHeaderField: "X-TAP-Timestamp")
        signedRequest.setValue(nonce, forHTTPHeaderField: "X-TAP-Nonce")

        // Build signature base string per RFC 9421
        let signatureBase = buildSignatureBase(
            request: signedRequest,
            timestamp: timestamp,
            nonce: nonce
        )

        // Sign the base string
        let signature = try signer.sign(signatureBase)

        // Build signature-input header
        let signatureInput = buildSignatureInput(timestamp: timestamp)

        signedRequest.setValue("sig=:\(signature):", forHTTPHeaderField: "Signature")
        signedRequest.setValue(signatureInput, forHTTPHeaderField: "Signature-Input")

        return signedRequest
    }

    /// Get TAP headers as dictionary (for manual request building)
    func getTAPHeaders(for method: String, url: URL, body: Data? = nil) throws -> [String: String] {
        let timestamp = Int(Date().timeIntervalSince1970)
        let nonce = UUID().uuidString

        var headers: [String: String] = [
            "X-TAP-Agent-Id": tapId,
            "X-TAP-Timestamp": String(timestamp),
            "X-TAP-Nonce": nonce
        ]

        // Build signature base
        let signatureBase = buildSignatureBaseManual(
            method: method,
            url: url,
            tapId: tapId,
            timestamp: timestamp,
            nonce: nonce
        )

        let signature = try signer.sign(signatureBase)
        let signatureInput = buildSignatureInput(timestamp: timestamp)

        headers["Signature"] = "sig=:\(signature):"
        headers["Signature-Input"] = signatureInput

        return headers
    }

    // MARK: - Private Helpers

    private func buildSignatureBase(
        request: URLRequest,
        timestamp: Int,
        nonce: String
    ) -> String {
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? "/"
        let authority = request.url?.host ?? ""

        // Canonical components per RFC 9421
        var components: [String] = []
        components.append("\"@method\": \(method)")
        components.append("\"@path\": \(path)")
        components.append("\"@authority\": \(authority)")
        components.append("\"x-tap-agent-id\": \(tapId)")
        components.append("\"x-tap-timestamp\": \(timestamp)")
        components.append("\"x-tap-nonce\": \(nonce)")

        return components.joined(separator: "\n")
    }

    private func buildSignatureBaseManual(
        method: String,
        url: URL,
        tapId: String,
        timestamp: Int,
        nonce: String
    ) -> String {
        let path = url.path.isEmpty ? "/" : url.path
        let authority = url.host ?? ""

        var components: [String] = []
        components.append("\"@method\": \(method)")
        components.append("\"@path\": \(path)")
        components.append("\"@authority\": \(authority)")
        components.append("\"x-tap-agent-id\": \(tapId)")
        components.append("\"x-tap-timestamp\": \(timestamp)")
        components.append("\"x-tap-nonce\": \(nonce)")

        return components.joined(separator: "\n")
    }

    private func buildSignatureInput(timestamp: Int) -> String {
        return "sig=(\"@method\" \"@path\" \"@authority\" \"x-tap-agent-id\" \"x-tap-timestamp\" \"x-tap-nonce\");keyid=\"\(keyId)\";alg=\"ed25519\";created=\(timestamp)"
    }
}

// MARK: - TAP Registration

/// TAP Agent registration response
struct TAPRegistration {
    let tapId: String
    let status: String
    let registeredAt: Date
    let publicKeyFingerprint: String
}

/// TAP Credentials for signing requests
struct TAPCredentials {
    let tapId: String
    let keyId: String
    let signer: TAPSigner

    /// Create credentials from signer
    static func create(tapId: String, ed25519Signer: Ed25519Signer) -> TAPCredentials {
        let keyId = "tap-key-\(UUID().uuidString.prefix(8))"
        let signer = TAPSigner(tapId: tapId, signer: ed25519Signer, keyId: keyId)
        return TAPCredentials(tapId: tapId, keyId: keyId, signer: signer)
    }
}

// MARK: - TAP Manager

/// Manages TAP registration and credentials
class TAPManager {
    static let shared = TAPManager()

    private var currentCredentials: TAPCredentials?
    private var ed25519Signer: Ed25519Signer?

    /// Register a new TAP agent
    func register(agentName: String) -> TAPCredentials {
        // Generate new Ed25519 key pair
        let signer = Ed25519Signer()
        self.ed25519Signer = signer

        // Generate TAP ID
        let timestamp = Date().timeIntervalSince1970.description.replacingOccurrences(of: ".", with: "")
        let tapId = "tap_\(agentName.lowercased().replacingOccurrences(of: " ", with: "-"))_\(timestamp.prefix(10))"

        // Create credentials
        let credentials = TAPCredentials.create(tapId: tapId, ed25519Signer: signer)
        self.currentCredentials = credentials

        return credentials
    }

    /// Get current TAP credentials
    var credentials: TAPCredentials? {
        currentCredentials
    }

    /// Sign a request with TAP
    func signRequest(_ request: URLRequest) throws -> URLRequest {
        guard let creds = currentCredentials else {
            throw TAPError.notRegistered
        }
        return try creds.signer.signRequest(request)
    }

    /// Get TAP headers for a request
    func getHeaders(method: String, url: URL) throws -> [String: String] {
        guard let creds = currentCredentials else {
            throw TAPError.notRegistered
        }
        return try creds.signer.getTAPHeaders(for: method, url: url)
    }
}

enum TAPError: Error, LocalizedError {
    case notRegistered
    case signingFailed

    var errorDescription: String? {
        switch self {
        case .notRegistered:
            return "TAP agent not registered"
        case .signingFailed:
            return "Failed to sign request"
        }
    }
}
