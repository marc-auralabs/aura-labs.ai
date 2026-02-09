import SwiftUI

/// Main intent input screen
struct IntentInputView: View {
    @ObservedObject var viewModel: SessionViewModel
    @State private var showConstraints = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                headerSection

                // Intent input
                intentInputSection

                // Constraints (expandable)
                constraintsSection

                // Submit button
                submitButton

                Spacer(minLength: 100)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
        .onTapGesture {
            // Dismiss keyboard on tap outside text fields
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: "cart.badge.plus")
                .font(.system(size: 48))
                .foregroundColor(.blue)

            Text("Scout-It!")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("AI Procurement Assistant")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.top, 20)
    }

    // MARK: - Intent Input

    private var intentInputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("What do you need to procure?", systemImage: "text.bubble")
                .font(.headline)

            TextEditor(text: $viewModel.intentText)
                .frame(height: 100)
                .scrollContentBackground(.hidden)
                .padding(12)
                .background(Color(.systemBackground))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(.separator), lineWidth: 1)
                )

            Text("Example: \"I need 10 ergonomic keyboards under $1500 for the design team\"")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    // MARK: - Constraints

    private var constraintsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: { withAnimation { showConstraints.toggle() } }) {
                HStack {
                    Label("Purchase Constraints", systemImage: "slider.horizontal.3")
                        .font(.headline)
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: showConstraints ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                }
            }

            if showConstraints {
                ConstraintsEditorView(constraints: $viewModel.constraints)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
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
