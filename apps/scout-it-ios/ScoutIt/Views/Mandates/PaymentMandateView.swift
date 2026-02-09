import SwiftUI

/// Detail view for Payment Mandate
struct PaymentMandateDetailView: View {
    let mandate: PaymentMandate

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // ID & References
            DetailRow(label: "Mandate ID", value: mandate.id)
            DetailRow(label: "Cart Ref", value: mandate.cartMandateRef)

            // Type & Version
            HStack {
                DetailChip(label: "Type", value: mandate.type.uppercased())
                DetailChip(label: "Version", value: mandate.version)
            }

            Divider()

            // Agent Info (TAP)
            Text("Agent (TAP Identity)")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack {
                Image(systemName: "person.badge.key")
                    .foregroundColor(.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text(mandate.agent.tapId)
                        .font(.caption.monospaced())
                    Text("Visa Trusted Agent Protocol")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
            .background(Color.purple.opacity(0.1))
            .cornerRadius(8)

            Divider()

            // Transaction
            Text("Transaction")
                .font(.caption)
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Amount")
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(mandate.transaction.currency) \(mandate.transaction.amount)")
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundColor(.green)
                }

                DetailRow(label: "Merchant", value: mandate.transaction.merchantName)
                DetailRow(label: "Merchant ID", value: mandate.transaction.merchantId)
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(8)

            // Payment Method
            Text("Payment Method")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack {
                Image(systemName: "creditcard.fill")
                    .foregroundColor(.blue)
                VStack(alignment: .leading) {
                    Text(mandate.paymentMethod.network.capitalized)
                        .font(.body)
                        .fontWeight(.medium)
                    Text(mandate.paymentMethod.tokenized ? "Tokenized" : "Direct")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Divider()

            // Risk Signals
            Text("Risk Assessment")
                .font(.caption)
                .foregroundColor(.secondary)

            VStack(spacing: 8) {
                RiskSignalRow(
                    label: "Intent Mandate Present",
                    isValid: mandate.riskSignals.intentMandatePresent
                )
                RiskSignalRow(
                    label: "Cart Mandate Present",
                    isValid: mandate.riskSignals.cartMandatePresent
                )
                RiskSignalRow(
                    label: "Constraints Valid",
                    isValid: mandate.riskSignals.constraintsValid
                )
                RiskSignalRow(
                    label: "Amount Within Limit",
                    isValid: mandate.riskSignals.amountWithinLimit
                )
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(8)

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

// MARK: - Risk Signal Row

struct RiskSignalRow: View {
    let label: String
    let isValid: Bool

    var body: some View {
        HStack {
            Image(systemName: isValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(isValid ? .green : .red)
            Text(label)
                .font(.caption)
            Spacer()
        }
    }
}

// MARK: - Helper Views

struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(1)
        }
    }
}

struct DetailChip: View {
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 4) {
            Text(label + ":")
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(value)
                .font(.caption2)
                .fontWeight(.semibold)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.systemGray5))
        .cornerRadius(4)
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        PaymentMandateDetailView(mandate: PaymentMandate(
            id: "mandate_pay_pqr54321",
            type: "payment",
            version: "1.0",
            issuedAt: "2026-02-09T12:10:00Z",
            cartMandateRef: "mandate_cart_xyz98765",
            issuer: MandateParty(type: "agent", id: "tap_scout-it_1234567890"),
            agent: AgentInfo(id: "scout-it-agent", tapId: "tap_scout-it_1234567890"),
            paymentMethod: PaymentMethod(type: "card", network: "visa", tokenized: true),
            transaction: Transaction(
                amount: 1499.90,
                currency: "USD",
                merchantId: "beacon-office-depot",
                merchantName: "Office Depot"
            ),
            riskSignals: RiskSignals(
                intentMandatePresent: true,
                cartMandatePresent: true,
                constraintsValid: true,
                amountWithinLimit: true
            ),
            proof: MandateProof(
                type: "Ed25519Signature2020",
                created: "2026-02-09T12:10:00Z",
                verificationMethod: "tap-key-abc123",
                proofPurpose: "assertionMethod",
                proofValue: "ghi789jkl012mno345pqr678stu901vwx234abc123def456"
            )
        ))
        .padding()
    }
}
