import SwiftUI

/// Main intent input screen
struct IntentInputView: View {
    @ObservedObject var viewModel: SessionViewModel

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Header
            headerSection

            Spacer().frame(height: 32)

            // Intent input
            intentInputSection
                .padding(.horizontal)

            Spacer()

            // Submit button
            submitButton
                .padding(.horizontal)
                .padding(.bottom, 32)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image("ScoutLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)

            Text("Scout-It!")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("AI Procurement Assistant")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: - Intent Input

    private var intentInputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("What do you need to procure?", systemImage: "text.bubble")
                .font(.headline)

            TextField("Describe what you need...", text: $viewModel.intentText, axis: .vertical)
                .lineLimit(3...6)
                .textFieldStyle(.roundedBorder)

            Text("Example: \"I need 10 ergonomic keyboards under $1500 for the design team\"")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - Submit

    private var submitButton: some View {
        VStack(spacing: 8) {
            Button(action: {
                Task {
                    await viewModel.startSession()
                }
            }) {
                HStack {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "magnifyingglass")
                        Text("Find Offers")
                    }
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(viewModel.intentText.isEmpty ? Color.gray : Color.blue)
                .cornerRadius(12)
            }
            .disabled(viewModel.intentText.isEmpty || viewModel.isLoading)

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    IntentInputView(viewModel: SessionViewModel())
}
