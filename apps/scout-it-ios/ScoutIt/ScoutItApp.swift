import SwiftUI

/// Scout-It! iOS App Entry Point
/// https://scout-it.ai
///
/// A B2B Procurement demo app showcasing the AURA agentic commerce stack:
/// - Natural language intent input
/// - Multi-offer comparison from Beacon vendors
/// - AP2 mandate chain visualization (Intent → Cart → Payment)
/// - Visa TAP signed checkout
///
@main
struct ScoutItApp: App {
    @StateObject private var viewModel = SessionViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
        }
    }
}
