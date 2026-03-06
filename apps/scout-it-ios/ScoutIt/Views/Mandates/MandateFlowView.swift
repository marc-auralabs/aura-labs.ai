import SwiftUI

/// Visual representation of the AP2 mandate chain
struct MandateFlowView: View {
    @ObservedObject var viewModel: SessionViewModel

    @State private var expandedMandate: MandateChain.MandateStep?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header
                headerSection

                // Mandate chain visualization
                mandateChainSection

                // Selected offer summary
                if let offer = viewModel.selectedOffer {
                    selectedOfferSection(offer)
                }

                // Action button
                actionButton
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "signature")
                .font(.system(size: 40))
                .foregroundColor(.purple)

            Text("Authorization Chain")
                .font(.title2)
                .fontWeight(.bold)

            Text("AP2 mandates create an auditable trail")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.bottom, 24)
    }

    // MARK: - Mandate Chain

    private var mandateChainSection: some View {
        VStack(spacing: 0) {
            // Intent Mandate
            MandateStepView(
                step: .intent,
                isComplete: viewModel.mandateChain.intentMandate != nil,
                isCurrent: viewModel.mandateChain.currentStep == .intent,
                isExpanded: expandedMandate == .intent,
                onTap: { toggleExpand(.intent) }
            ) {
                if let mandate = viewModel.mandateChain.intentMandate {
                    IntentMandateDetailView(mandate: mandate)
                }
            }

            // Connector line
            connectorLine(isActive: viewModel.mandateChain.intentMandate != nil)

            // Cart Mandate
            MandateStepView(
                step: .cart,
                isComplete: viewModel.mandateChain.cartMandate != nil,
                isCurrent: viewModel.mandateChain.currentStep == .cart,
                isExpanded: expandedMandate == .cart,
                onTap: { toggleExpand(.cart) }
            ) {
                if let mandate = viewModel.mandateChain.cartMandate {
                    CartMandateDetailView(mandate: mandate)
                }
            }

            // Connector line
            connectorLine(isActive: viewModel.mandateChain.cartMandate != nil)

            // Payment Mandate
            MandateStepView(
                step: .payment,
                isComplete: viewModel.mandateChain.paymentMandate != nil,
                isCurrent: viewModel.mandateChain.currentStep == .payment,
                isExpanded: expandedMandate == .payment,
                onTap: { toggleExpand(.payment) }
            ) {
                if let mandate = viewModel.mandateChain.paymentMandate {
                    PaymentMandateDetailView(mandate: mandate)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    private func connectorLine(isActive: Bool) -> some View {
        Rectangle()
            .fill(isActive ? Color.green : Color(.systemGray4))
            .frame(width: 2, height: 24)
            .padding(.leading, 19)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func toggleExpand(_ step: MandateChain.MandateStep) {
        withAnimation {
            if expandedMandate == step {
                expandedMandate = nil
            } else {
                expandedMandate = step
            }
        }
    }

    // MARK: - Selected Offer

    private func selectedOfferSection(_ offer: Offer) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Selected Offer", systemImage: "checkmark.seal")
                .font(.headline)
                .foregroundColor(.green)

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(offer.product.name)
                        .font(.body)
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
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .padding(.top, 20)
    }

    // MARK: - Action Button

    private var actionButton: some View {
        Group {
            if viewModel.mandateChain.cartMandate == nil {
                // Need to create cart mandate
                Button(action: {
                    Task {
                        await viewModel.approveOffer()
                    }
                }) {
                    HStack {
                        if viewModel.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "signature")
                            Text("Approve & Create Cart Mandate")
                        }
                    }
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.purple)
                    .cornerRadius(12)
                }
                .disabled(viewModel.isLoading)
            }

            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.top, 8)
            }
        }
        .padding(.top, 20)
    }
}

// MARK: - Mandate Step View

struct MandateStepView<Content: View>: View {
    let step: MandateChain.MandateStep
    let isComplete: Bool
    let isCurrent: Bool
    let isExpanded: Bool
    let onTap: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onTap) {
                HStack(spacing: 12) {
                    // Status icon
                    ZStack {
                        Circle()
                            .fill(backgroundColor)
                            .frame(width: 40, height: 40)

                        Image(systemName: iconName)
                            .foregroundColor(.white)
                            .font(.system(size: 16, weight: .semibold))
                    }

                    // Step info
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.title)
                            .font(.headline)
                            .foregroundColor(.primary)

                        Text(step.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    // Expand indicator
                    if isComplete {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .buttonStyle(PlainButtonStyle())

            // Expanded content
            if isExpanded && isComplete {
                content()
                    .padding(.top, 12)
                    .padding(.leading, 52)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var backgroundColor: Color {
        if isComplete { return .green }
        if isCurrent { return .blue }
        return Color(.systemGray4)
    }

    private var iconName: String {
        if isComplete { return "checkmark" }
        switch step {
        case .none: return "circle"
        case .intent: return "1.circle"
        case .cart: return "2.circle"
        case .payment: return "3.circle"
        }
    }
}

// MARK: - Preview

#Preview {
    MandateFlowView(viewModel: SessionViewModel())
}
