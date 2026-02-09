import SwiftUI

/// Editor for purchase constraints
struct ConstraintsEditorView: View {
    @Binding var constraints: Constraints

    @State private var budgetText = ""
    @State private var categoryInput = ""
    @State private var showDatePicker = false

    private let availableCategories = [
        "electronics",
        "office-supplies",
        "furniture",
        "software",
        "cloud-services",
        "hardware"
    ]

    var body: some View {
        VStack(spacing: 16) {
            // Budget
            budgetSection

            Divider()

            // Currency
            currencySection

            Divider()

            // Categories
            categoriesSection

            Divider()

            // Delivery date
            deliverySection
        }
        .onAppear {
            budgetText = "\(constraints.maxAmount)"
        }
    }

    // MARK: - Budget

    private var budgetSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Maximum Budget", systemImage: "dollarsign.circle")
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack {
                Text(constraints.currency)
                    .foregroundColor(.secondary)

                TextField("1000", text: $budgetText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .onChange(of: budgetText) { newValue in
                        if let amount = Decimal(string: newValue) {
                            constraints.maxAmount = amount
                        }
                    }
            }
        }
    }

    // MARK: - Currency

    private var currencySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Currency", systemImage: "banknote")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Picker("Currency", selection: $constraints.currency) {
                Text("USD").tag("USD")
                Text("EUR").tag("EUR")
                Text("GBP").tag("GBP")
            }
            .pickerStyle(SegmentedPickerStyle())
        }
    }

    // MARK: - Categories

    private var categoriesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Allowed Categories", systemImage: "tag")
                .font(.subheadline)
                .foregroundColor(.secondary)

            // Category chips - using LazyVGrid for reliable scrolling
            CategoryGrid(
                categories: availableCategories,
                selectedCategories: constraints.categories,
                onToggle: toggleCategory
            )

            if constraints.categories.isEmpty {
                Text("No restrictions (all categories allowed)")
                    .font(.caption)
                    .foregroundColor(.secondary)
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
        VStack(alignment: .leading, spacing: 8) {
            Label("Delivery Before", systemImage: "calendar")
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack {
                if let date = constraints.deliveryBefore {
                    Text(date, style: .date)
                    Spacer()
                    Button("Clear") {
                        constraints.deliveryBefore = nil
                    }
                    .font(.caption)
                    .foregroundColor(.red)
                } else {
                    Text("No deadline")
                        .foregroundColor(.secondary)
                    Spacer()
                }

                Button(action: { showDatePicker.toggle() }) {
                    Image(systemName: "calendar.badge.plus")
                }
            }

            if showDatePicker {
                DatePicker(
                    "Delivery Date",
                    selection: Binding(
                        get: { constraints.deliveryBefore ?? Date().addingTimeInterval(7 * 24 * 60 * 60) },
                        set: { constraints.deliveryBefore = $0 }
                    ),
                    in: Date()...,
                    displayedComponents: .date
                )
                .datePickerStyle(GraphicalDatePickerStyle())
            }
        }
    }
}

// MARK: - Category Chip

struct CategoryChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.blue : Color(.systemGray5))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(16)
        }
    }
}

// MARK: - Category Grid
struct CategoryGrid: View {
    let categories: [String]
    let selectedCategories: [String]
    let onToggle: (String) -> Void

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(categories, id: \.self) { category in
                CategoryChip(
                    title: category,
                    isSelected: selectedCategories.contains(category),
                    action: { onToggle(category) }
                )
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ConstraintsEditorView(constraints: .constant(Constraints()))
        .padding()
}
