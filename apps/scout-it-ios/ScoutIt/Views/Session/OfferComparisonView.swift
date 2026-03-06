import SwiftUI

/// Compare offers from multiple Beacons
struct OfferComparisonView: View {
    @ObservedObject var viewModel: SessionViewModel

    @State private var selectedOfferId: String?
    @State private var showComparison = false

    var offers: [Offer] {
        viewModel.currentOffers
    }

    var body: some View {
        VStack(spacing: 0) {
            // Scrollable content
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    headerSection

                    // Offers list
                    if offers.isEmpty {
                        emptyState
                    } else {
                        offersSection
                    }

                    // Bottom padding for scroll content
                    Color.clear.frame(height: 20)
                }
                .padding()
            }

            // Fixed continue button at bottom
            if selectedOfferId != nil {
                continueButton
                    .padding()
                    .background(Color(.systemGroupedBackground))
            }
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                Text("\(offers.count) Offers Found")
                    .font(.headline)
            }

            Text("Compare offers and select the best one")
                .font(.subheadline)
                .foregroundColor(.secondary)

            // Budget indicator
            HStack {
                Text("Budget:")
                    .foregroundColor(.secondary)
                Text(verbatim: "\(viewModel.constraints.currency) \(viewModel.constraints.maxAmount)")
                    .fontWeight(.semibold)
                    .foregroundColor(.blue)
            }
            .font(.caption)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }

    // MARK: - Offers

    private var offersSection: some View {
        VStack(spacing: 16) {
            ForEach(offers) { offer in
                OfferCard(
                    offer: offer,
                    isSelected: selectedOfferId == offer.id,
                    budget: viewModel.constraints.maxAmount,
                    onSelect: { selectedOfferId = offer.id }
                )
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No offers available")
                .font(.headline)

            Text("Try adjusting your constraints")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(40)
    }

    // MARK: - Continue

    private var continueButton: some View {
        Button(action: {
            if let id = selectedOfferId,
               let offer = offers.first(where: { $0.id == id }) {
                viewModel.selectOffer(offer)
            }
        }) {
            HStack {
                Image(systemName: "arrow.right.circle.fill")
                Text("Continue with Selected Offer")
            }
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue)
            .cornerRadius(12)
        }
    }
}

// MARK: - Offer Card

struct OfferCard: View {
    let offer: Offer
    let isSelected: Bool
    let budget: Decimal
    let onSelect: () -> Void

    private var isWithinBudget: Bool {
        offer.totalPrice <= budget
    }

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 12) {
                // Vendor header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(offer.beaconName)
                            .font(.headline)
                            .foregroundColor(.primary)

                        Text(offer.beaconId)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    // Selection indicator
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundColor(isSelected ? .blue : .gray)
                }

                Divider()

                // Product info
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(offer.product.name)
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)

                        if let sku = offer.product.sku {
                            Text("SKU: \(sku)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Text("Qty: \(offer.quantity) @ \(offer.formattedUnitPrice) each")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    // Price
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(offer.formattedPrice)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(isWithinBudget ? .green : .red)

                        if !isWithinBudget {
                            Text("Over budget")
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                    }
                }

                // Delivery info
                if let delivery = offer.deliveryDate {
                    HStack {
                        Image(systemName: "shippingbox")
                            .foregroundColor(.secondary)
                        Text("Delivery: \(delivery)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                // Terms
                if let terms = offer.terms {
                    Text(terms)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
            )
            .shadow(color: isSelected ? .blue.opacity(0.2) : .clear, radius: 8)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Preview

#Preview {
    OfferComparisonView(viewModel: {
        let vm = SessionViewModel()
        // Add mock offers for preview
        return vm
    }())
}
