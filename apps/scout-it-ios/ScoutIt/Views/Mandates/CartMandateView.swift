import SwiftUI

/// Detail view for Cart Mandate
struct CartMandateDetailView: View {
    let mandate: CartMandate

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // ID & References
            DetailRow(label: "Mandate ID", value: mandate.id)
            DetailRow(label: "Intent Ref", value: mandate.intentMandateRef)
            DetailRow(label: "Session ID", value: mandate.sessionId)

            // Type & Version
            HStack {
                DetailChip(label: "Type", value: mandate.type.uppercased())
                DetailChip(label: "Version", value: mandate.version)
            }

            Divider()

            // Cart Details
            Text("Cart")
                .font(.caption)
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(mandate.cart.product.name)
                        .font(.body)
                        .fontWeight(.medium)
                    Spacer()
                    Text("\(mandate.cart.currency) \(mandate.cart.totalAmount)")
                        .fontWeight(.bold)
                        .foregroundColor(.green)
                }

                if let sku = mandate.cart.product.sku {
                    DetailRow(label: "SKU", value: sku)
                }
                DetailRow(label: "Quantity", value: "\(mandate.cart.product.quantity)")
                DetailRow(label: "Unit Price", value: "\(mandate.cart.currency) \(mandate.cart.product.unitPrice)")
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(8)

            // Beacon Info
            Text("Vendor")
                .font(.caption)
                .foregroundColor(.secondary)
            DetailRow(label: "Beacon", value: mandate.cart.beaconName)
            DetailRow(label: "Beacon ID", value: mandate.cart.beaconId)

            Divider()

            // Timing
            Text("Validity")
                .font(.caption)
                .foregroundColor(.secondary)
            DetailRow(label: "Issued At", value: mandate.issuedAt)
            DetailRow(label: "Expires At", value: mandate.expiresAt)

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
            DetailRow(label: "Key ID", value: mandate.proof.verificationMethod)

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
    CartMandateDetailView(mandate: CartMandate(
        id: "mandate_cart_xyz98765",
        type: "cart",
        version: "1.0",
        issuedAt: "2026-02-09T12:05:00Z",
        intentMandateRef: "mandate_intent_abc12345",
        sessionId: "session-123",
        issuer: MandateParty(type: "user", id: "user-abc123"),
        cart: CartDetails(
            offerId: "offer-001",
            beaconId: "beacon-office-depot",
            beaconName: "Office Depot",
            product: CartProduct(
                name: "Ergonomic Keyboard",
                sku: "KB-ERGO-001",
                quantity: 10,
                unitPrice: 149.99
            ),
            totalAmount: 1499.90,
            currency: "USD"
        ),
        expiresAt: "2026-02-09T12:35:00Z",
        proof: MandateProof(
            type: "Ed25519Signature2020",
            created: "2026-02-09T12:05:00Z",
            verificationMethod: "key-abc123",
            proofPurpose: "assertionMethod",
            proofValue: "def456ghi789jkl012mno345pqr678stu901vwx234abc123"
        )
    ))
    .padding()
}
