import Foundation
import CryptoKit

/// Ed25519 cryptographic signer using CryptoKit
class Ed25519Signer {
    private let privateKey: Curve25519.Signing.PrivateKey

    /// Initialize with a new random key pair
    init() {
        self.privateKey = Curve25519.Signing.PrivateKey()
    }

    /// Initialize from existing private key data
    init(privateKeyData: Data) throws {
        self.privateKey = try Curve25519.Signing.PrivateKey(rawRepresentation: privateKeyData)
    }

    /// Public key as raw bytes
    var publicKey: Data {
        privateKey.publicKey.rawRepresentation
    }

    /// Public key as base64 string
    var publicKeyBase64: String {
        publicKey.base64EncodedString()
    }

    /// Private key as raw bytes (for secure storage)
    var privateKeyData: Data {
        privateKey.rawRepresentation
    }

    /// Sign data and return signature
    func sign(_ data: Data) throws -> Data {
        try privateKey.signature(for: data)
    }

    /// Sign string and return base64 signature
    func sign(_ string: String) throws -> String {
        guard let data = string.data(using: .utf8) else {
            throw SigningError.invalidInput
        }
        let signature = try sign(data)
        return signature.base64EncodedString()
    }

    /// Verify a signature against data using a public key
    static func verify(
        signature: Data,
        for data: Data,
        publicKey: Data
    ) -> Bool {
        guard let pubKey = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKey) else {
            return false
        }
        return pubKey.isValidSignature(signature, for: data)
    }

    enum SigningError: Error {
        case invalidInput
        case signingFailed
    }
}

// MARK: - Key Pair for AP2 Mandates

/// Key pair for AP2 mandate signing
struct AP2KeyPair {
    let signer: Ed25519Signer
    let keyId: String

    init() {
        self.signer = Ed25519Signer()
        self.keyId = "key-\(UUID().uuidString.prefix(8))"
    }

    init(signer: Ed25519Signer, keyId: String) {
        self.signer = signer
        self.keyId = keyId
    }

    var publicKeyBase64: String {
        signer.publicKeyBase64
    }

    /// Sign mandate data
    func signMandate(_ mandateData: String) throws -> String {
        try signer.sign(mandateData)
    }
}
