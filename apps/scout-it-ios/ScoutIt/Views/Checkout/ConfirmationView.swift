import SwiftUI

/// Order confirmation screen with audit trail
struct ConfirmationView: View {
    @ObservedObject var viewModel: SessionViewModel

    @State private var showAuditTrail = false
    @State private var animateCheckmark = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Success animation
                successHeader

                // Order details
                orderDetailsSection

                // Audit trail
                auditTrailSection

                // Actions
                actionsSection
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                animateCheckmark = true
            }
        }
    }

    // MARK: - Success Header

    private var successHeader: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.2))
                    .frame(width: 120, height: 120)
                    .scaleEffect(animateCheckmark ? 1.0 : 0.5)

                Circle()
                    .fill(Color.green)
                    .frame(width: 80, height: 80)
                    .scaleEffect(animateCheckmark ? 1.0 : 0.3)

                Image(systemName: "checkmark")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundColor(.white)
                    .scaleEffect(animateCheckmark ? 1.0 : 0.0)
            }

            Text("Order Complete!")
                .font(.title)
                .fontWeight(.bold)

            Text("Your purchase has been processed successfully")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 20)
    }

    // MARK: - Order Details

    private var orderDetailsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Order Details", systemImage: "bag.fill")
                .font(.headline)

            if let offer = viewModel.selectedOffer {
                VStack(alignment: .leading, spacing: 12) {
                    // Product
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(offer.product.name)
                                .font(.body)
                                .fontWeight(.medium)

                            Text(offer.beaconName)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        Text(offer.formattedPrice)
                            .font(.title3)
                            .fontWeight(.bold)
                            .foregroundColor(.green)
                    }

                    Divider()

                    // Order ID (mock)
                    HStack {
                        Text("Order ID")
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("ORD-\(viewModel.currentSession?.id.prefix(8) ?? "000000")")
                            .font(.body.monospaced())
                    }

                    // Estimated delivery
                    if let delivery = offer.deliveryDate {
                        HStack {
                            Text("Est. Delivery")
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(delivery)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - Audit Trail

    private var auditTrailSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: { withAnimation { showAuditTrail.toggle() } }) {
                HStack {
                    Image(systemName: "shield.checkered")
                        .foregroundColor(.purple)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Complete Audit Trail")
                            .font(.headline)
                            .foregroundColor(.primary)

                        Text("View cryptographic proof chain")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Image(systemName: showAuditTrail ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                }
            }

            if showAuditTrail {
                VStack(alignment: .leading, spacing: 16) {
                    Divider()

                    // Intent Mandate
                    if let intent = viewModel.mandateChain.intentMandate {
                        AuditTrailItem(
                            step: 1,
                            title: "Intent Mandate",
                            id: intent.id,
                            timestamp: intent.issuedAt,
                            signaturePreview: intent.proof.proofValue
                        )
                    }

                    // Cart Mandate
                    if let cart = viewModel.mandateChain.cartMandate {
                        AuditTrailItem(
                            step: 2,
                            title: "Cart Mandate",
                            id: cart.id,
                            timestamp: cart.issuedAt,
                            signaturePreview: cart.proof.proofValue
                        )
                    }

                    // Payment Mandate
                    if let payment = viewModel.mandateChain.paymentMandate {
                        AuditTrailItem(
                            step: 3,
                            title: "Payment Mandate",
                            id: payment.id,
                            timestamp: payment.issuedAt,
                            signaturePreview: payment.proof.proofValue
                        )
                    }

                    // TAP Signature
                    if let creds = viewModel.tapCredentials {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("4")
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .frame(width: 24, height: 24)
                                    .background(Color.purple)
                                    .foregroundColor(.white)
                                    .cornerRadius(12)

                                Text("TAP Signature")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                DetailRow(label: "Agent ID", value: creds.tapId)
                                DetailRow(label: "Key ID", value: creds.keyId)
                                DetailRow(label: "Algorithm", value: "Ed25519")
                            }
                            .padding(.leading, 32)
                        }
                    }

                    // Chain verification
                    HStack {
                        Image(systemName: "checkmark.shield.fill")
                            .foregroundColor(.green)
                        Text("All signatures verified")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.green.opacity(0.1))
                    .cornerRadius(8)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - Actions

    private var actionsSection: some View {
        VStack(spacing: 12) {
            Button(action: { viewModel.reset() }) {
                HStack {
                    Image(systemName: "plus.circle")
                    Text("Start New Session")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .cornerRadius(12)
            }

            Button(action: {
                // Would share receipt in real app
            }) {
                HStack {
                    Image(systemName: "square.and.arrow.up")
                    Text("Share Receipt")
                }
                .font(.subheadline)
                .foregroundColor(.blue)
            }
        }
    }
}

// MARK: - Audit Trail Item

struct AuditTrailItem: View {
    let step: Int
    let title: String
    let id: String
    let timestamp: String
    let signaturePreview: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(step)")
                    .font(.caption)
                    .fontWeight(.bold)
                    .frame(width: 24, height: 24)
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)

                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }

            VStack(alignment: .leading, spacing: 4) {
                DetailRow(label: "ID", value: id)
                DetailRow(label: "Issued", value: timestamp)

                HStack(alignment: .top) {
                    Text("Signature")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(signaturePreview.prefix(24) + "...")
                        .font(.caption2.monospaced())
                        .foregroundColor(.green)
                }
            }
            .padding(.leading, 32)
        }
    }
}

// MARK: - Preview

#Preview {
    ConfirmationView(viewModel: SessionViewModel())
}
