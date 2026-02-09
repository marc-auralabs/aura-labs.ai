import Foundation
import Combine

/// Main view model for shopping session state
@MainActor
class SessionViewModel: ObservableObject {
    // MARK: - Published State

    @Published var currentSession: Session?
    @Published var mandateChain = MandateChain()
    @Published var tapCredentials: TAPCredentials?

    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var currentStep: AppStep = .intent

    // Intent input
    @Published var intentText = ""
    @Published var constraints = Constraints()

    // Selection state
    @Published var selectedOffer: Offer?

    // MARK: - App Navigation Steps

    enum AppStep: Int, CaseIterable {
        case intent = 0
        case searching = 1
        case offers = 2
        case mandates = 3
        case checkout = 4
        case confirmation = 5

        var title: String {
            switch self {
            case .intent: return "What do you need?"
            case .searching: return "Finding offers..."
            case .offers: return "Compare Offers"
            case .mandates: return "Authorization"
            case .checkout: return "Checkout"
            case .confirmation: return "Complete"
            }
        }
    }

    // MARK: - Services

    private let api = AuraCore.shared
    private let keyManager = KeyManager.shared
    private let tapManager = TAPManager.shared
    private var pollingTask: Task<Void, Never>?

    // MARK: - User/Agent IDs

    private let userId = "user-\(UUID().uuidString.prefix(8))"
    private var agentId: String { tapCredentials?.tapId ?? "scout-it-agent" }

    // MARK: - Initialization

    init() {
        setupTAPCredentials()
    }

    private func setupTAPCredentials() {
        tapCredentials = tapManager.register(agentName: "ScoutIt")
    }

    // MARK: - Session Actions

    /// Start a new shopping session
    func startSession() async {
        guard !intentText.isEmpty else {
            errorMessage = "Please describe what you need"
            return
        }

        isLoading = true
        errorMessage = nil
        currentStep = .searching

        do {
            // Create intent mandate first
            let intentMandate = try await createIntentMandate()
            mandateChain.intentMandate = intentMandate

            // Create session with Core API
            let session = try await api.createSession(
                intent: intentText,
                constraints: constraints,
                agentId: agentId
            )
            currentSession = session

            // Start polling for offers
            startPollingForOffers()

        } catch {
            errorMessage = error.localizedDescription
            currentStep = .intent
        }

        isLoading = false
    }

    /// Poll for session updates until offers are ready
    private func startPollingForOffers() {
        pollingTask?.cancel()
        var pollCount = 0

        pollingTask = Task {
            while !Task.isCancelled {
                guard let sessionId = currentSession?.id else { break }
                pollCount += 1

                do {
                    let updated = try await api.getSession(id: sessionId)
                    await MainActor.run {
                        self.currentSession = updated

                        if updated.status == .offersReady && !updated.offers.isEmpty {
                            self.currentStep = .offers
                            self.pollingTask?.cancel()
                        } else if updated.status == .failed {
                            self.errorMessage = "Session failed"
                            self.currentStep = .intent
                            self.pollingTask?.cancel()
                        }
                    }
                } catch {
                    // Continue polling on transient errors
                }

                // DEMO MODE: After 3 polls (~6 seconds), generate mock offers
                if pollCount >= 3 {
                    await MainActor.run {
                        self.injectMockOffers()
                        self.currentStep = .offers
                        self.pollingTask?.cancel()
                    }
                    break
                }

                try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            }
        }
    }

    /// DEMO: Inject mock offers for demonstration
    private func injectMockOffers() {
        let mockOffers = [
            Offer(
                id: "offer-\(UUID().uuidString.prefix(8))",
                sessionId: currentSession?.id,
                beaconId: "beacon-acme-supplies",
                beaconName: "ACME Office Supplies",
                product: Product(name: "Premium Purple Towels", sku: "PPT-100", description: "Soft, absorbent purple towels"),
                quantity: 100,
                unitPrice: Decimal(string: "8.50")!,
                totalPrice: Decimal(string: "850.00")!,
                currency: "GBP",
                deliveryDate: Calendar.current.date(byAdding: .day, value: 5, to: Date()),
                terms: "Net 30, 30-day returns"
            ),
            Offer(
                id: "offer-\(UUID().uuidString.prefix(8))",
                sessionId: currentSession?.id,
                beaconId: "beacon-global-textiles",
                beaconName: "Global Textiles Co",
                product: Product(name: "Luxury Purple Towels", sku: "LPT-PRO", description: "Premium Egyptian cotton purple towels"),
                quantity: 100,
                unitPrice: Decimal(string: "12.00")!,
                totalPrice: Decimal(string: "1200.00")!,
                currency: "GBP",
                deliveryDate: Calendar.current.date(byAdding: .day, value: 3, to: Date()),
                terms: "Net 15, 60-day returns"
            ),
            Offer(
                id: "offer-\(UUID().uuidString.prefix(8))",
                sessionId: currentSession?.id,
                beaconId: "beacon-budget-wholesale",
                beaconName: "Budget Wholesale",
                product: Product(name: "Standard Purple Towels", sku: "SPT-ECO", description: "Economy purple towels"),
                quantity: 100,
                unitPrice: Decimal(string: "5.99")!,
                totalPrice: Decimal(string: "599.00")!,
                currency: "GBP",
                deliveryDate: Calendar.current.date(byAdding: .day, value: 10, to: Date()),
                terms: "Prepaid, 14-day returns"
            ),
        ]

        // Store mock offers directly for the view to access
        mockSessionOffers = mockOffers
    }

    // DEMO: Store mock offers separately since Session is immutable
    @Published var mockSessionOffers: [Offer] = []

    /// Get current offers (from session or mock)
    var currentOffers: [Offer] {
        if let sessionOffers = currentSession?.offers, !sessionOffers.isEmpty {
            return sessionOffers
        }
        return mockSessionOffers
    }

    /// Select an offer
    func selectOffer(_ offer: Offer) {
        selectedOffer = offer
        currentStep = .mandates
    }

    /// Approve selected offer (create cart mandate)
    func approveOffer() async {
        guard let offer = selectedOffer,
              let session = currentSession,
              let intentMandate = mandateChain.intentMandate else {
            errorMessage = "No offer selected"
            return
        }

        isLoading = true

        do {
            // Create cart mandate
            let cartMandate = try await createCartMandate(for: offer, intentMandate: intentMandate)
            mandateChain.cartMandate = cartMandate

            // DEMO MODE: Skip API call for mock offers
            if !mockSessionOffers.isEmpty {
                currentStep = .checkout
            } else {
                // Approve with real API
                let updated = try await api.approveOffer(
                    sessionId: session.id,
                    offerId: offer.id,
                    intentMandateRef: intentMandate.id,
                    userId: userId
                )
                currentSession = updated
                currentStep = .checkout
            }

        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    /// Complete checkout (create payment mandate and process)
    func checkout() async {
        guard let cartMandate = mandateChain.cartMandate,
              let offer = selectedOffer else {
            errorMessage = "Missing required data"
            return
        }

        isLoading = true

        do {
            // Create payment mandate
            let paymentMandate = try await createPaymentMandate(cartMandate: cartMandate, offer: offer)
            mandateChain.paymentMandate = paymentMandate

            // DEMO MODE: Skip API call for mock offers
            if !mockSessionOffers.isEmpty {
                // Simulate successful checkout
                try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second delay for realism
                currentStep = .confirmation
            } else {
                // Real API checkout
                guard let session = currentSession else {
                    errorMessage = "Missing session"
                    isLoading = false
                    return
                }

                // Get TAP signed headers
                let checkoutURL = URL(string: "\(AuraCore.baseURL)/checkout")!
                let tapHeaders = try tapManager.getHeaders(method: "POST", url: checkoutURL)

                // Process checkout
                let result = try await api.checkout(
                    sessionId: session.id,
                    paymentMandate: paymentMandate,
                    tapSignedHeaders: tapHeaders
                )

                if result.success {
                    currentStep = .confirmation
                } else {
                    errorMessage = "Checkout failed"
                }
            }

        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    /// Reset to start new session
    func reset() {
        pollingTask?.cancel()
        currentSession = nil
        mandateChain = MandateChain()
        mockSessionOffers = []
        intentText = ""
        constraints = Constraints()
        selectedOffer = nil
        errorMessage = nil
        currentStep = .intent
        setupTAPCredentials()
    }

    // MARK: - Mandate Creation

    private func createIntentMandate() async throws -> IntentMandate {
        let userKeyPair = try keyManager.getUserKeyPair()
        let now = ISO8601DateFormatter().string(from: Date())
        let validUntil = ISO8601DateFormatter().string(from: Date().addingTimeInterval(24 * 60 * 60))

        let mandateId = "mandate_intent_\(UUID().uuidString.prefix(8))"

        // Build mandate data for signing
        let mandateData = "\(mandateId)|\(agentId)|\(constraints.maxAmount)|\(now)"
        let signature = try userKeyPair.signMandate(mandateData)

        return IntentMandate(
            id: mandateId,
            type: "intent",
            version: "1.0",
            issuedAt: now,
            issuer: MandateParty(type: "user", id: userId),
            subject: MandateParty(type: "agent", id: agentId),
            constraints: IntentMandate.MandateConstraints(
                maxAmount: constraints.maxAmount,
                currency: constraints.currency,
                categories: constraints.categories.isEmpty ? nil : constraints.categories,
                merchantAllowlist: constraints.merchantAllowlist,
                merchantBlocklist: constraints.merchantBlocklist,
                validUntil: validUntil
            ),
            metadata: IntentMandate.MandateMetadata(
                purpose: intentText,
                tapRegistration: tapCredentials?.tapId
            ),
            proof: MandateProof(
                type: "Ed25519Signature2020",
                created: now,
                verificationMethod: userKeyPair.keyId,
                proofPurpose: "assertionMethod",
                proofValue: signature
            )
        )
    }

    private func createCartMandate(for offer: Offer, intentMandate: IntentMandate) async throws -> CartMandate {
        let userKeyPair = try keyManager.getUserKeyPair()
        let now = ISO8601DateFormatter().string(from: Date())
        let expires = ISO8601DateFormatter().string(from: Date().addingTimeInterval(30 * 60)) // 30 min

        let mandateId = "mandate_cart_\(UUID().uuidString.prefix(8))"

        let mandateData = "\(mandateId)|\(intentMandate.id)|\(offer.id)|\(offer.totalPrice)|\(now)"
        let signature = try userKeyPair.signMandate(mandateData)

        return CartMandate(
            id: mandateId,
            type: "cart",
            version: "1.0",
            issuedAt: now,
            intentMandateRef: intentMandate.id,
            sessionId: currentSession?.id ?? "",
            issuer: MandateParty(type: "user", id: userId),
            cart: CartDetails(
                offerId: offer.id,
                beaconId: offer.beaconId,
                beaconName: offer.beaconName,
                product: CartProduct(
                    name: offer.product.name,
                    sku: offer.product.sku,
                    quantity: offer.quantity,
                    unitPrice: offer.unitPrice
                ),
                totalAmount: offer.totalPrice,
                currency: offer.currency
            ),
            expiresAt: expires,
            proof: MandateProof(
                type: "Ed25519Signature2020",
                created: now,
                verificationMethod: userKeyPair.keyId,
                proofPurpose: "assertionMethod",
                proofValue: signature
            )
        )
    }

    private func createPaymentMandate(cartMandate: CartMandate, offer: Offer) async throws -> PaymentMandate {
        guard let creds = tapCredentials else {
            throw TAPError.notRegistered
        }

        let agentSigner = try keyManager.getAgentKeyPair()
        let now = ISO8601DateFormatter().string(from: Date())

        let mandateId = "mandate_pay_\(UUID().uuidString.prefix(8))"

        let mandateData = "\(mandateId)|\(cartMandate.id)|\(offer.totalPrice)|\(now)"
        let signature = try agentSigner.sign(mandateData)

        return PaymentMandate(
            id: mandateId,
            type: "payment",
            version: "1.0",
            issuedAt: now,
            cartMandateRef: cartMandate.id,
            issuer: MandateParty(type: "agent", id: agentId),
            agent: AgentInfo(id: agentId, tapId: creds.tapId),
            paymentMethod: PaymentMethod(type: "card", network: "visa", tokenized: true),
            transaction: Transaction(
                amount: offer.totalPrice,
                currency: offer.currency,
                merchantId: offer.beaconId,
                merchantName: offer.beaconName
            ),
            riskSignals: RiskSignals(
                intentMandatePresent: true,
                cartMandatePresent: true,
                constraintsValid: true,
                amountWithinLimit: offer.totalPrice <= constraints.maxAmount
            ),
            proof: MandateProof(
                type: "Ed25519Signature2020",
                created: now,
                verificationMethod: creds.keyId,
                proofPurpose: "assertionMethod",
                proofValue: signature
            )
        )
    }
}
