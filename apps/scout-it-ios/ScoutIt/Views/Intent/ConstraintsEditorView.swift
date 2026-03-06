import SwiftUI

/// Editor for purchase constraints
struct ConstraintsEditorView: View {
    @Binding var constraints: Constraints

    @State private var budgetText = ""

    private let availableCategories = [
        "electronics",
        "office-supplies",
        "furniture",
        "software",
        "cloud-services",
        "hardware"
    ]

    var body: some View {
        Group {
            Section("Budget") {
                budgetSection
            }

            Section("Currency") {
                currencySection
            }

            Section("Categories") {
                categoriesSection
            }

            Section("Delivery") {
                deliverySection
            }
        }
        .onAppear {
            budgetText = "\(constraints.maxAmount)"
        }
    }

    // MARK: - Budget

    private var budgetSection: some View {
        HStack {
            Text(constraints.currency)
                .foregroundColor(.secondary)

            TextField("1000", text: $budgetText)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .onChange(of: budgetText) { newValue in
                    if let amount = Decimal(string: newValue) {
                        constraints.maxAmount = amount
                    }
                }
        }
    }

    // MARK: - Currency

    private var currencySection: some View {
        Picker("Currency", selection: $constraints.currency) {
            Text("USD").tag("USD")
            Text("EUR").tag("EUR")
            Text("GBP").tag("GBP")
        }
        .pickerStyle(SegmentedPickerStyle())
    }

    // MARK: - Categories

    private var categoriesSection: some View {
        ForEach(availableCategories, id: \.self) { category in
            Button(action: { toggleCategory(category) }) {
                HStack {
                    Text(category)
                        .foregroundColor(.primary)
                    Spacer()
                    if constraints.categories.contains(category) {
                        Image(systemName: "checkmark")
                            .foregroundColor(.blue)
                    }
                }
            }
        }
    }

    private func toggleCategory(_ category: String) {
        if constraints.categories.contains(category) {
            constraints.categories.removeAll { $0 == category }
        } else {
            constraints.categories.append(category)
        }
    }

    // MARK: - Delivery

    private var deliverySection: some View {
        Group {
            DatePicker(
                "Deliver by",
                selection: Binding(
                    get: { constraints.deliveryBefore ?? Date().addingTimeInterval(7 * 24 * 60 * 60) },
                    set: { constraints.deliveryBefore = $0 }
                ),
                in: Date()...,
                displayedComponents: .date
            )

            if constraints.deliveryBefore != nil {
                Button("Clear deadline", role: .destructive) {
                    constraints.deliveryBefore = nil
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ConstraintsEditorView(constraints: .constant(Constraints()))
        .padding()
}
