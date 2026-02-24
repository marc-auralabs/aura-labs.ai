---
name: stack-node-scala-swift
description: >
  Language-specific TDD patterns, security idioms, and project structure
  guidance for Node.js/TypeScript, Scala/Akka, and Swift. This is a companion
  to the senior-engineer skill. Use this skill whenever generating code in
  Node.js, TypeScript, JavaScript, Scala, Akka, or Swift. Also trigger when
  the user references Jest, Vitest, ScalaTest, AkkaTestKit, XCTest, Swift
  Testing, Express, Akka HTTP, SwiftUI, or any framework in this stack.
---

# Stack Patterns: Node.js · Scala/Akka · Swift

This skill provides idiomatic patterns for the project's language stack. It
works alongside the `senior-engineer` core skill, which defines the
language-agnostic principles (TDD philosophy, complexity controls, OWASP,
loose coupling, data documentation, ask-before-assume).

Everything here is concrete and copy-pasteable. If a pattern below conflicts
with an organisational standard the user has provided, the organisational
standard wins.

---

## Testing Frameworks

| Language     | Default Framework                         |
|-------------|-------------------------------------------|
| Node.js      | Jest or Vitest                            |
| TypeScript   | Jest or Vitest                            |
| Scala        | ScalaTest (with AkkaTestKit for actors)   |
| Swift        | XCTest / Swift Testing (Swift 6+)         |

---

## Node.js / TypeScript

### TDD Patterns

```typescript
// Descriptive nesting — describe the unit, then the scenario
describe('PaymentService', () => {
  describe('processPayment', () => {
    it('should reject negative amounts', async () => {
      await expect(service.processPayment(-10))
        .rejects.toThrow(InvalidAmountError);
    });

    it('should return transaction ID on success', async () => {
      const result = await service.processPayment(100);
      expect(result.transactionId).toMatch(/^txn_[a-z0-9]+$/);
    });
  });
});

// Mock external dependencies explicitly
const mockGateway = {
  charge: jest.fn().mockResolvedValue({ status: 'success' }),
};
const service = new PaymentService(mockGateway);

// Supertest for HTTP endpoint testing
import request from 'supertest';

describe('POST /api/transfers', () => {
  it('should return 400 for missing recipient', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .send({ amount: 100 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('recipient');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .send({ amount: 100, recipient: 'user_123' });

    expect(res.status).toBe(401);
  });
});

// Test factories for consistent test data
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_' + randomUUID(),
    email: 'test@example.com',
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  };
}
```

### Security Patterns

```typescript
// Input validation with Zod at the API boundary
import { z } from 'zod';

const TransferSchema = z.object({
  recipient: z.string().uuid(),
  amount: z.number().positive().int(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'SGD']),
  reference: z.string().max(140).optional(),
});

app.post('/api/transfers', authenticate, (req, res) => {
  const result = TransferSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.issues });
  }
});

// SQL: parameterised queries always
const user = await pool.query(
  'SELECT * FROM users WHERE id = $1 AND org_id = $2',
  [userId, orgId]
);

// Environment variables: validate at startup, fail fast
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
});
export const env = EnvSchema.parse(process.env);

// Rate limiting on sensitive endpoints
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts' },
});
app.post('/api/login', authLimiter, loginHandler);

// Security headers and CORS
import helmet from 'helmet';
import cors from 'cors';
app.use(helmet());
app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(','),
  credentials: true,
}));

// Password hashing
import argon2 from 'argon2';
const hash = await argon2.hash(password);
const valid = await argon2.verify(hash, password);

// SECURITY: Never log tokens or credentials
logger.info('User authenticated', { userId: user.id });
```

### Project Structure

- Co-locate tests: `service.ts` / `service.test.ts` in the same directory.
- TypeScript strict mode (`strict: true` in tsconfig).
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Use typed error classes extending `Error`, or `Result<T, E>` patterns.
- Prefer async/await over raw Promises. Never mix callbacks and Promises.
- Use `node:` prefix for built-in modules.
- Complexity tool: `eslint` with `complexity` rule, or `eslint-plugin-sonarjs`.

---

## Scala / Akka

### TDD Patterns

```scala
// ScalaTest — pick FlatSpec or WordSpec per project and be consistent
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class TransferServiceSpec extends AnyFlatSpec with Matchers {

  "TransferService" should "reject transfers with insufficient funds" in {
    val account = Account(balance = 100)
    val service = new TransferService()

    val result = service.transfer(account, recipient, amount = 200)
    result shouldBe Left(InsufficientFunds(available = 100, requested = 200))
  }

  it should "debit the sender and credit the receiver" in {
    val sender = Account(balance = 500)
    val receiver = Account(balance = 0)

    val Right((updatedSender, updatedReceiver)) =
      service.transfer(sender, receiver, amount = 200): @unchecked

    updatedSender.balance shouldBe 300
    updatedReceiver.balance shouldBe 200
  }
}

// Property-based testing with ScalaCheck
import org.scalatestplus.scalacheck.ScalaCheckPropertyChecks

class AmountValidationSpec extends AnyFlatSpec
    with Matchers with ScalaCheckPropertyChecks {

  "Amount.validate" should "reject all negative values" in {
    forAll { (n: Int) =>
      whenever(n < 0) {
        Amount.validate(n) shouldBe Left(NegativeAmount)
      }
    }
  }
}

// Akka Typed actor testing with ActorTestKit
import akka.actor.testkit.typed.scaladsl.ScalaTestWithActorTestKit
import org.scalatest.wordspec.AnyWordSpecLike

class PaymentActorSpec extends ScalaTestWithActorTestKit
    with AnyWordSpecLike {

  "PaymentActor" must {
    "respond with Confirmed for valid payments" in {
      val probe = createTestProbe[PaymentActor.Response]()
      val actor = spawn(PaymentActor())

      actor ! PaymentActor.ProcessPayment(
        amount = 100,
        currency = "SGD",
        replyTo = probe.ref
      )

      probe.expectMessage(PaymentActor.Confirmed(transactionId = _))
    }

    "respond with Rejected for negative amounts" in {
      val probe = createTestProbe[PaymentActor.Response]()
      val actor = spawn(PaymentActor())

      actor ! PaymentActor.ProcessPayment(
        amount = -50,
        currency = "SGD",
        replyTo = probe.ref
      )

      probe.expectMessage(PaymentActor.Rejected("Amount must be positive"))
    }

    "handle timeout from downstream service" in {
      val probe = createTestProbe[PaymentActor.Response]()
      val mockGateway = spawn(MockGateway.withDelay(10.seconds))
      val actor = spawn(PaymentActor(gateway = mockGateway))

      actor ! PaymentActor.ProcessPayment(100, "SGD", probe.ref)

      probe.expectMessage(3.seconds, PaymentActor.TimedOut)
    }
  }
}

// Akka Streams testing
import akka.stream.testkit.scaladsl.TestSink

"Transaction stream" should "filter out zero-amount entries" in {
  val source = Source(List(
    Transaction(100), Transaction(0), Transaction(50)
  ))

  source
    .via(TransactionFilter.nonZero)
    .runWith(TestSink[Transaction]())
    .request(3)
    .expectNext(Transaction(100))
    .expectNext(Transaction(50))
    .expectComplete()
}
```

### Security Patterns

```scala
// Smart constructors — reject invalid data at the boundary
final case class Email private (value: String) extends AnyVal

object Email {
  private val pattern =
    "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$".r

  def apply(raw: String): Either[ValidationError, Email] =
    if (pattern.matches(raw)) Right(new Email(raw))
    else Left(ValidationError(s"Invalid email: $raw"))
}

// SQL: parameterised queries with Doobie or Slick — never interpolate
// Doobie
def findUser(id: UserId): ConnectionIO[Option[User]] =
  sql"SELECT * FROM users WHERE id = ${id.value}"
    .query[User]
    .option

// Slick
def findUser(id: UserId) =
  users.filter(_.id === id.value).result.headOption

// Secrets: load from environment, fail fast
object Config {
  val dbUrl: String = sys.env.getOrElse("DATABASE_URL",
    throw new IllegalStateException("DATABASE_URL not set"))
  val jwtSecret: String = sys.env.getOrElse("JWT_SECRET",
    throw new IllegalStateException("JWT_SECRET not set"))
}

// Akka HTTP: validate at the route boundary
val createUserRoute: Route =
  pathPrefix("api" / "users") {
    post {
      entity(as[CreateUserRequest]) { req =>
        req.validate() match {
          case Left(errors) =>
            complete(StatusCodes.BadRequest, errors)
          case Right(validated) =>
            onSuccess(userService.create(validated)) { user =>
              complete(StatusCodes.Created, user.toResponse)
            }
        }
      }
    }
  }

// SECURITY: Actors trust internal messages — validate at the HTTP edge
// before sending messages to actors.

// Prevent accidental logging of sensitive data
final case class Password private (private val hash: String) {
  override def toString: String = "Password(***)"
}
```

### Project Structure

- Standard sbt layout: `src/main/scala`, `src/test/scala`.
- Use typed actors (`akka.actor.typed`) — untyped actors are legacy.
- Prefer `Either[Error, T]` and sealed trait error hierarchies over
  exceptions for domain errors.
- Keep actors focused: one responsibility per actor.
- Supervision strategies: always define explicitly, never rely on defaults.
- Prefer immutable case classes. Avoid `var` in domain logic.
- Complexity tool: `scalastyle` or `scalafix` with complexity rules.

---

## Swift

### TDD Patterns

```swift
// XCTest — naming: test_<unit>_<scenario>_<expected>
import XCTest
@testable import PaymentKit

final class TransferServiceTests: XCTestCase {

    private var sut: TransferService!
    private var mockGateway: MockPaymentGateway!

    override func setUp() {
        super.setUp()
        mockGateway = MockPaymentGateway()
        sut = TransferService(gateway: mockGateway)
    }

    override func tearDown() {
        sut = nil
        mockGateway = nil
        super.tearDown()
    }

    func test_transfer_insufficientFunds_throwsError() {
        let account = Account(balance: 100)

        XCTAssertThrowsError(
            try sut.transfer(from: account, amount: 200)
        ) { error in
            XCTAssertEqual(
                error as? TransferError,
                .insufficientFunds(available: 100, requested: 200)
            )
        }
    }

    func test_transfer_validAmount_debitsCorrectly() throws {
        let account = Account(balance: 500)
        let result = try sut.transfer(from: account, amount: 200)
        XCTAssertEqual(result.updatedBalance, 300)
        XCTAssertNotNil(result.transactionId)
    }
}

// Async testing (Swift 5.5+)
func test_fetchUser_invalidId_returnsNil() async throws {
    let user = try await userService.fetch(id: "nonexistent")
    XCTAssertNil(user)
}

// Swift Testing framework (Swift 6+)
import Testing
@testable import PaymentKit

@Suite("TransferService")
struct TransferServiceTests {

    @Test("rejects negative transfer amounts")
    func rejectNegativeAmount() throws {
        let service = TransferService()
        #expect(throws: TransferError.invalidAmount) {
            try service.transfer(from: account, amount: -100)
        }
    }

    @Test("processes valid transfers", arguments: [100, 250, 500])
    func validAmounts(amount: Int) throws {
        let account = Account(balance: 1000)
        let result = try service.transfer(from: account, amount: amount)
        #expect(result.updatedBalance == 1000 - amount)
    }
}

// Protocol-based mocking
protocol PaymentGateway {
    func charge(amount: Decimal, currency: Currency)
        async throws -> TransactionID
}

final class MockPaymentGateway: PaymentGateway {
    var chargeResult: Result<TransactionID, Error> = .success("txn_mock")
    var chargeCallCount = 0

    func charge(amount: Decimal, currency: Currency)
        async throws -> TransactionID {
        chargeCallCount += 1
        return try chargeResult.get()
    }
}
```

### Security Patterns

```swift
// Strong types for validated input
struct Amount {
    let value: Decimal

    init(_ raw: Decimal) throws {
        guard raw > 0 else { throw ValidationError.nonPositiveAmount }
        guard raw <= 1_000_000 else { throw ValidationError.exceedsLimit }
        self.value = raw
    }
}

// SECURITY: Keychain for secrets, never UserDefaults
import Security

func storeToken(_ token: String, forKey key: String) throws {
    let data = Data(token.utf8)
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecValueData as String: data,
        kSecAttrAccessible as String:
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw KeychainError.storeFailed(status)
    }
}

// Network: enforce TLS, pin certificates for sensitive endpoints
let session = URLSession(
    configuration: .default,
    delegate: CertificatePinningDelegate(),
    delegateQueue: nil
)

// Logging: privacy controls, never log secrets
import os

private let logger = Logger(
    subsystem: "com.app.payment", category: "auth"
)

func authenticate(user: String) {
    logger.info("Auth attempt: \(user, privacy: .public)")
    // SECURITY: never log tokens or credentials
}

// Strict Codable decoding for API responses
struct APIUser: Codable {
    let id: String
    let email: String
    let role: UserRole

    enum UserRole: String, Codable {
        case user, admin
    }
}

let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase
let user = try decoder.decode(APIUser.self, from: data)
```

### Project Structure

- Swift Package Manager for dependencies. Pin versions in
  `Package.resolved`.
- Organise by feature: `Sources/PaymentKit/Transfer/`, not by layer.
- Tests mirror source: `Tests/PaymentKitTests/Transfer/`.
- Protocols for boundaries. Inject via initialisers, not singletons.
- Prefer value types (`struct`, `enum`) unless identity is needed.
- Use `async/await` and structured concurrency over GCD for new code.
- Mark classes `final` by default.
- Swift actors for shared mutable state — prefer over locks and queues.
- Typed `Error` enums. Avoid `NSError` bridging unless calling ObjC APIs.
- Complexity tool: `swiftlint` with `cyclomatic_complexity` rule.
