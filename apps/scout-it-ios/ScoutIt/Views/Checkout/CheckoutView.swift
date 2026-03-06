import SwiftUI

/// Final checkout screen with TAP signature
struct CheckoutView: View {
    @ObservedObject var viewModel: SessionViewModel

    @State private var showTAPDetails = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                headerSection

                // Order summary
                orderSummarySection

                // TAP signature section
                tapSignatureSection

                // Mandate chain summary
                mandateChainSummary

                // Checkout button
                checkoutButton
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 48))
                .foregroundColor(.blue)

            Text("Ready to Checkout")
                .font(.title2)
                .fontWeight(.bold)

            Text("Review your order and complete payment")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Order Summary

    private var orderSummarySection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Order Summary", systemImage: "bag")
                .font(.headline)

            if let offer = viewModel.selectedOffer {
                VStack(alignment: .leading, spacing: 12) {
                    // Product
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(offer.product.name)
                                .font(.body)
                                .fontWeight(.medium)

                            Text("from \(offer.beaconName)")
                                .font(.caption)
                                .foregroundColor(.secondary)

                            if let sku = offer.product.sku {
                                Text("SKU: \(sku)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        }

                        Spacer()
                    }

                    Divider()

                    // Pricing breakdown
                    HStack {
                        Text("Unit Price")
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(offer.formattedUnitPrice)
                    }
                    .font(.subheadline)

                    HStack {
                        Text("Quantity")
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("× \(offer.quantity)")
                    }
                    .font(.subheadline)

                    Divider()

                    HStack {
                        Text("Total")
                            .font(.headline)
                        Spacer()
                        Text(offer.formattedPrice)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.green)
                    }

                    // Delivery
                    if let delivery = offer.deliveryDate {
                        HStack {
                            Image(systemName: "shippingbox")
                                .foregroundColor(.blue)
                            Text("Estimated delivery: \(delivery)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - TAP Signature

    private var tapSignatureSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: { withAnimation { showTAPDetails.toggle() } }) {
                HStack {
                    Image(systemName: "person.badge.key.fill")
                        .foregroundColor(.purple)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Visa TAP Signature")
                            .font(.headline)
                            .foregroundColor(.primary)

                        Text("Request will be cryptographically signed")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Image(systemName: "checkmark.shield.fill")
                        .foregroundColor(.green)

                    Image(systemName: showTAPDetails ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                }
            }

            if showTAPDetails, let creds = viewModel.tapCredentials {
                VStack(alignment: .leading, spacing: 8) {
                    Divider()

                    DetailRow(label: "TAP Agent ID", value: creds.tapId)
                    DetailRow(label: "Key ID", value: creds.keyId)
                    DetailRow(label: "Algorithm", value: "Ed25519")
                    DetailRow(label: "Signature Format", value: "HTTP Message Signatures (RFC 9421)")

                    Text("The payment request will include:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.top, 4)

                    VStack(alignment: .leading, spacing: 4) {
                        TAPHeaderPreview(name: "X-TAP-Agent-Id", value: creds.tapId)
                        TAPHeaderPreview(name: "X-TAP-Timestamp", value: "<unix timestamp>")
                        TAPHeaderPreview(name: "X-TAP-Nonce", value: "<unique nonce>")
                        TAPHeaderPreview(name: "Signature", value: "sig=:<base64>:")
                        TAPHeaderPreview(name: "Signature-Input", value: "sig=(...)")
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - Mandate Chain Summary

    private var mandateChainSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Authorization Chain", systemImage: "link")
                .font(.headline)

            HStack(spacing: 8) {
                MandateChip(
                    type: "Intent",
                    isComplete: viewModel.mandateChain.intentMandate != nil
                )

                Image(systemName: "arrow.right")
                    .foregroundColor(.secondary)

                MandateChip(
                    type: "Cart",
                    isComplete: viewModel.mandateChain.cartMandate != nil
                )

                Image(systemName: "arrow.right")
                    .foregroundColor(.secondary)

                MandateChip(
                    type: "Payment",
                    isComplete: false,
                    isPending: true
                )
            }

            Text("Payment mandate will be created upon checkout")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - Checkout Button

    private var checkoutButton: some View {
        VStack(spacing: 12) {
            Button(action: {
                Task {
                    await viewModel.checkout()
                }
            }) {
                HStack {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "creditcard.fill")
                        Text("Complete Purchase")
                    }
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.green)
                .cornerRadius(12)
            }
            .disabled(viewModel.isLoading)

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }

            Text("By completing this purchase, you authorize the agent to process payment using the approved mandate chain.")
                .font(.caption2)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Helper Views

struct TAPHeaderPreview: View {
    let name: String
    let value: String

    var body: some View {
        HStack(spacing: 4) {
            Text(name + ":")
                .font(.caption2.monospaced())
                .foregroundColor(.purple)
            Text(value)
                .font(.caption2.monospaced())
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }
}

struct MandateChip: View {
    let type: String
    let isComplete: Bool
    var isPending: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: isComplete ? "checkmark.circle.fill" : (isPending ? "circle.dotted" : "circle"))
                .foregroundColor(isComplete ? .green : (isPending ? .orange : .gray))
            Text(type)
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.systemGray6))
        .cornerRadius(8)
    }
}

// MARK: - Preview

#Preview {
    CheckoutView(viewModel: SessionViewModel())
}
