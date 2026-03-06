import SwiftUI

/// Main content view with navigation based on session state
struct ContentView: View {
    @EnvironmentObject var viewModel: SessionViewModel

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                // Current step view
                currentStepView
            }
            .navigationTitle(viewModel.currentStep.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if viewModel.currentStep != .intent && viewModel.currentStep != .confirmation {
                        Button(action: goBack) {
                            Image(systemName: "chevron.left")
                        }
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    if viewModel.currentStep != .intent {
                        Button(action: { viewModel.reset() }) {
                            Image(systemName: "xmark.circle")
                        }
                    }
                }

                ToolbarItem(placement: .principal) {
                    StepIndicator(currentStep: viewModel.currentStep)
                }
            }
        }
    }

    // MARK: - Current Step View

    @ViewBuilder
    private var currentStepView: some View {
        switch viewModel.currentStep {
        case .intent:
            IntentInputView(viewModel: viewModel)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))

        case .searching:
            SessionProgressView(viewModel: viewModel)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))

        case .offers:
            OfferComparisonView(viewModel: viewModel)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))

        case .mandates:
            MandateFlowView(viewModel: viewModel)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))

        case .checkout:
            CheckoutView(viewModel: viewModel)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .leading)
                ))

        case .confirmation:
            ConfirmationView(viewModel: viewModel)
                .transition(.asymmetric(
                    insertion: .scale.combined(with: .opacity),
                    removal: .opacity
                ))
        }
    }

    // MARK: - Navigation

    private func goBack() {
        withAnimation {
            switch viewModel.currentStep {
            case .searching:
                viewModel.currentStep = .intent
            case .offers:
                viewModel.currentStep = .searching
            case .mandates:
                viewModel.currentStep = .offers
                viewModel.selectedOffer = nil
            case .checkout:
                viewModel.currentStep = .mandates
            default:
                break
            }
        }
    }
}

// MARK: - Step Indicator

struct StepIndicator: View {
    let currentStep: SessionViewModel.AppStep

    private let steps: [SessionViewModel.AppStep] = [
        .intent, .searching, .offers, .mandates, .checkout, .confirmation
    ]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(steps, id: \.rawValue) { step in
                Circle()
                    .fill(stepColor(for: step))
                    .frame(width: 8, height: 8)
            }
        }
    }

    private func stepColor(for step: SessionViewModel.AppStep) -> Color {
        if step.rawValue < currentStep.rawValue {
            return .green
        } else if step == currentStep {
            return .blue
        } else {
            return Color(.systemGray4)
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environmentObject(SessionViewModel())
}
