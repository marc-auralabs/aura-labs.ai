import SwiftUI

/// Detail view for Intent Mandate
struct IntentMandateDetailView: View {
    let mandate: IntentMandate

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // ID
            DetailRow(label: "Mandate ID", value: mandate.id)

            // Type & Version
            HStack {
                DetailChip(label: "Type", value: mandate.type.uppercased())
                DetailChip(label: "Version", value: mandate.version)
            }

            Divider()

            // Issuer (User)
            Text("Issuer (User)")
                .font(.caption)
                .foregroundColor(.secondary)
            DetailRow(label: "Type", value: mandate.issuer.type)
            DetailRow(label: "ID", value: String(mandate.issuer.id.prefix(20)) + "...")

            Divider()

            // Subject (Agent)
            Text("Subject (Agent)")
                .font(.caption)
                .foregroundColor(.secondary)
            DetailRow(label: "Type", value: mandate.subject.type)
            DetailRow(label: "ID", value: String(mandate.subject.id.prefix(20)) + "...")

            Divider()

            // Constraints
            Text("Constraints")
                .font(.caption)
                .foregroundColor(.secondary)
            DetailRow(label: "Max Amount", value: "\(mandate.constraints.currency) \(mandate.constraints.maxAmount)")
            if let categories = mandate.constraints.categories, !categories.isEmpty {
                DetailRow(label: "Categories", value: categories.joined(separator: ", "))
            }
            if let validUntil = mandate.constraints.validUntil {
                DetailRow(label: "Valid Until", value: validUntil)
            }

            Divider()

            // Proof
            proofSection
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }

    private var proofSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "signature")
                    .foregroundColor(.green)
                Text("Cryptographic Proof")
                    .font(.caption)
                    .fontWeight(.semibold)
            }

            DetailRow(label: "Type", value: mandate.proof.type)
            DetailRow(label: "Created", value: mandate.proof.created)
            DetailRow(label: "Key ID", value: mandate.proof.verificationMethod)

            // Truncated signature
            VStack(alignment: .leading, spacing: 4) {
                Text("Signature")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(mandate.proof.proofValue.prefix(40) + "...")
                    .font(.caption.monospaced())
                    .foregroundColor(.green)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    IntentMandateDetailView(mandate: IntentMandate(
        id: "mandate_intent_abc12345",
        type: "intent",
        version: "1.0",
        issuedAt: "2026-02-09T12:00:00Z",
        issuer: MandateParty(type: "user", id: "user-abc123"),
        subject: MandateParty(type: "agent", id: "tap_scout-it_1234567890"),
        constraints: IntentMandate.MandateConstraints(
            maxAmount: 1500,
            currency: "USD",
            categories: ["electronics", "office-supplies"],
            merchantAllowlist: nil,
            merchantBlocklist: nil,
            validUntil: "2026-02-10T12:00:00Z"
        ),
        metadata: IntentMandate.MandateMetadata(
            purpose: "Office equipment",
            tapRegistration: "tap_scout-it_1234567890"
        ),
        proof: MandateProof(
            type: "Ed25519Signature2020",
            created: "2026-02-09T12:00:00Z",
            verificationMethod: "key-abc123",
            proofPurpose: "assertionMethod",
            proofValue: "abc123def456ghi789jkl012mno345pqr678stu901vwx234"
        )
    ))
    .padding()
}
