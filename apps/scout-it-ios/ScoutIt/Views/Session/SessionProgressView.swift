import SwiftUI

/// Shows session progress while searching for offers
struct SessionProgressView: View {
    @ObservedObject var viewModel: SessionViewModel

    @State private var animationPhase = 0
    @State private var dots = ""

    private let beaconIcons = ["building.2", "shippingbox", "desktopcomputer", "cloud", "gear"]

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Animated search icon
            searchAnimation

            // Status text
            statusSection

            // Session info
            if let session = viewModel.currentSession {
                sessionInfoCard(session)
            }

            // Intent summary
            intentSummary

            Spacer()

            // Cancel button
            cancelButton
        }
        .padding()
        .background(Color(.systemGroupedBackground))
        .onAppear { startAnimation() }
    }

    // MARK: - Search Animation

    private var searchAnimation: some View {
        ZStack {
            // Rotating beacons
            ForEach(0..<5, id: \.self) { index in
                Image(systemName: beaconIcons[index])
                    .font(.title2)
                    .foregroundColor(.blue.opacity(0.6))
                    .offset(beaconOffset(for: index))
                    .animation(
                        .easeInOut(duration: 2)
                        .repeatForever(autoreverses: true)
                        .delay(Double(index) * 0.2),
                        value: animationPhase
                    )
            }

            // Center magnifying glass
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.blue)
                .scaleEffect(animationPhase == 0 ? 1.0 : 1.1)
                .animation(
                    .easeInOut(duration: 1)
                    .repeatForever(autoreverses: true),
                    value: animationPhase
                )
        }
        .frame(height: 120)
    }

    private func beaconOffset(for index: Int) -> CGSize {
        let angle: CGFloat = (CGFloat(index) / 5.0) * 2 * .pi - .pi / 2
        let radius: CGFloat = animationPhase == 0 ? 60 : 70
        return CGSize(
            width: cos(angle) * radius,
            height: sin(angle) * radius
        )
    }

    // MARK: - Status

    private var statusSection: some View {
        VStack(spacing: 8) {
            Text("Searching for Offers\(dots)")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Contacting vendor Beacons...")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .onReceive(Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()) { _ in
            dots = dots.count >= 3 ? "" : dots + "."
        }
    }

    // MARK: - Session Info

    private func sessionInfoCard(_ session: Session) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Session", systemImage: "number")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                Text(session.id.prefix(12) + "...")
                    .font(.caption.monospaced())
                    .foregroundColor(.secondary)
            }

            HStack {
                Label("Status", systemImage: "circle.fill")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                StatusBadge(status: session.status)
            }

            if !session.offers.isEmpty {
                HStack {
                    Label("Offers Found", systemImage: "tag")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(session.offers.count)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.green)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }

    // MARK: - Intent Summary

    private var intentSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Your Request", systemImage: "text.quote")
                .font(.caption)
                .foregroundColor(.secondary)

            Text(viewModel.intentText)
                .font(.body)
                .foregroundColor(.primary)
                .lineLimit(3)

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "dollarsign.circle")
                    Text("Budget: \(viewModel.constraints.currency) \(String(describing: viewModel.constraints.maxAmount))")
                }
                .font(.caption)
                .foregroundColor(.blue)

                if !viewModel.constraints.categories.isEmpty {
                    Text("•")
                        .foregroundColor(.secondary)
                    Text(viewModel.constraints.categories.joined(separator: ", "))
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground))
        .cornerRadius(12)
    }

    // MARK: - Cancel

    private var cancelButton: some View {
        Button(action: { viewModel.reset() }) {
            Text("Cancel")
                .foregroundColor(.red)
        }
    }

    // MARK: - Animation

    private func startAnimation() {
        withAnimation {
            animationPhase = 1
        }
    }
}

// MARK: - Status Badge

struct StatusBadge: View {
    let status: Session.SessionStatus

    var body: some View {
        Text(status.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .foregroundColor(.white)
            .cornerRadius(8)
    }

    private var backgroundColor: Color {
        switch status {
        case .pending: return .gray
        case .searching: return .blue
        case .marketForming: return .orange
        case .offersReady: return .green
        case .approved: return .purple
        case .completed: return .green
        case .failed: return .red
        }
    }
}

// MARK: - Preview

#Preview {
    SessionProgressView(viewModel: SessionViewModel())
}
