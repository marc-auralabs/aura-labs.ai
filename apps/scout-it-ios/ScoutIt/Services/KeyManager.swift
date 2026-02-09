import Foundation
import Security

/// Secure key storage using iOS Keychain
class KeyManager {
    static let shared = KeyManager()

    private let service = "ai.aura.scout-it"

    // MARK: - Key Storage

    /// Save private key to keychain
    func savePrivateKey(_ data: Data, identifier: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: identifier,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        // Delete existing key if present
        SecItemDelete(query as CFDictionary)

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeyManagerError.saveFailed(status)
        }
    }

    /// Load private key from keychain
    func loadPrivateKey(identifier: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: identifier,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            throw KeyManagerError.loadFailed(status)
        }

        return data
    }

    /// Delete key from keychain
    func deleteKey(identifier: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: identifier
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeyManagerError.deleteFailed(status)
        }
    }

    /// Check if key exists
    func keyExists(identifier: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: identifier,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    // MARK: - User Key Management

    private let userKeyIdentifier = "user-private-key"
    private let agentKeyIdentifier = "agent-private-key"
    private let tapIdIdentifier = "tap-agent-id"

    /// Get or create user key pair for AP2 mandates
    func getUserKeyPair() throws -> AP2KeyPair {
        if keyExists(identifier: userKeyIdentifier) {
            let keyData = try loadPrivateKey(identifier: userKeyIdentifier)
            let signer = try Ed25519Signer(privateKeyData: keyData)
            return AP2KeyPair(signer: signer, keyId: "user-\(userKeyIdentifier)")
        } else {
            let keyPair = AP2KeyPair()
            try savePrivateKey(keyPair.signer.privateKeyData, identifier: userKeyIdentifier)
            return keyPair
        }
    }

    /// Get or create agent key pair for TAP
    func getAgentKeyPair() throws -> Ed25519Signer {
        if keyExists(identifier: agentKeyIdentifier) {
            let keyData = try loadPrivateKey(identifier: agentKeyIdentifier)
            return try Ed25519Signer(privateKeyData: keyData)
        } else {
            let signer = Ed25519Signer()
            try savePrivateKey(signer.privateKeyData, identifier: agentKeyIdentifier)
            return signer
        }
    }

    /// Save TAP ID
    func saveTAPId(_ tapId: String) throws {
        guard let data = tapId.data(using: .utf8) else {
            throw KeyManagerError.invalidData
        }
        try savePrivateKey(data, identifier: tapIdIdentifier)
    }

    /// Load TAP ID
    func loadTAPId() throws -> String? {
        guard keyExists(identifier: tapIdIdentifier) else { return nil }
        let data = try loadPrivateKey(identifier: tapIdIdentifier)
        return String(data: data, encoding: .utf8)
    }

    /// Reset all keys (for testing/debug)
    func resetAllKeys() {
        try? deleteKey(identifier: userKeyIdentifier)
        try? deleteKey(identifier: agentKeyIdentifier)
        try? deleteKey(identifier: tapIdIdentifier)
    }
}

// MARK: - Errors

enum KeyManagerError: Error, LocalizedError {
    case saveFailed(OSStatus)
    case loadFailed(OSStatus)
    case deleteFailed(OSStatus)
    case invalidData

    var errorDescription: String? {
        switch self {
        case .saveFailed(let status):
            return "Failed to save key: \(status)"
        case .loadFailed(let status):
            return "Failed to load key: \(status)"
        case .deleteFailed(let status):
            return "Failed to delete key: \(status)"
        case .invalidData:
            return "Invalid key data"
        }
    }
}
