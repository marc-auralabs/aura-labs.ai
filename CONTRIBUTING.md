# Contributing to AURA Framework

Thank you for your interest in contributing to AURA! This document provides guidelines and best practices for contributing to the framework.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Documentation Standards](#documentation-standards)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

## Code of Conduct

AURA is committed to fostering an open and welcoming environment. We expect all contributors to:

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js** 18+ (or Python 3.9+ or Go 1.21+ depending on your contribution area)
- **Git** for version control
- **A GitHub account**
- Basic understanding of the AURA architecture (see [ARCHITECTURE.md](./docs/ARCHITECTURE.md))

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/aura-framework.git
   cd aura-framework
   ```

3. **Add the upstream repository**:
   ```bash
   git remote add upstream https://github.com/aura-labs/aura-framework.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   # or for Python: pip install -r requirements.txt
   # or for Go: go mod download
   ```

5. **Verify your setup**:
   ```bash
   npm test
   npm run lint
   ```

## Development Workflow

### Creating a New Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests

### Keeping Your Fork Updated

Before starting work, sync with upstream:

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Code Style Guidelines

### General Principles

All code contributions should follow these principles:

1. **Well-Commented**: Every module, class, and function should have comprehensive documentation
2. **Modular**: Components should be independent and composable
3. **Production-Ready**: Include proper error handling, logging, and monitoring
4. **Test-Covered**: All new code should have corresponding tests

### JavaScript/Node.js Style

We follow the [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) with some modifications:

**File Structure**:
```javascript
/**
 * Module description
 * 
 * Detailed explanation of what this module does, its purpose,
 * and how it fits into the larger system.
 * 
 * @module ModuleName
 * @version 1.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

const express = require('express');
const { EventEmitter } = require('events');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TIMEOUT = 5000;

// ============================================================================
// CLASS DEFINITION
// ============================================================================

/**
 * ClassName description.
 * 
 * Additional details about the class, its responsibilities,
 * and usage patterns.
 */
class ClassName extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

  /**
   * Method description.
   * 
   * Detailed explanation of what the method does, including
   * algorithm notes, edge cases, and usage examples.
   * 
   * @param {String} paramName - Parameter description
   * @returns {Object} Return value description
   * @throws {Error} When error conditions occur
   */
  methodName(paramName) {
    // Implementation
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Private helper method.
   * @private
   */
  _helperMethod() {
    // Implementation
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = ClassName;
```

**Key Points**:
- Use meaningful variable and function names
- Prefer `const` over `let`, never use `var`
- Use async/await over callbacks
- Always handle errors explicitly
- Use JSDoc comments for all public APIs
- Group related functionality with section comments

**Example of Well-Commented Code**:
```javascript
/**
 * Calculate dynamic pricing based on scout behavior and constraints.
 * 
 * This implements a multi-factor pricing algorithm that considers:
 * - Historical purchase behavior (loyalty)
 * - Current inventory levels
 * - Scout's budget constraints
 * - Competitive positioning
 * 
 * The algorithm weights these factors to arrive at an optimal price
 * that maximizes conversion while maintaining margin requirements.
 * 
 * @param {String} propositionId - The proposition being negotiated
 * @param {Object} behavioralData - Scout's historical behavior patterns
 * @param {Object} behavioralData.purchaseHistory - Past purchase data
 * @param {Number} behavioralData.purchaseHistory.totalPurchases - Number of purchases
 * @param {Number} behavioralData.purchaseHistory.averageOrderValue - Average order value
 * @param {Object} constraints - Scout's stated constraints
 * @param {Number} constraints.maxPrice - Maximum acceptable price
 * @returns {Object} Pricing details
 * @returns {Number} return.basePrice - Original item price
 * @returns {Number} return.offeredPrice - Calculated offer price
 * @returns {Number} return.discountPercent - Applied discount percentage
 * @returns {Array} return.incentives - Additional incentives offered
 */
calculateDynamicPricing(propositionId, behavioralData, constraints) {
  // Get base price from inventory
  const item = this.inventory.get(propositionId);
  const basePrice = item.basePrice;
  
  // Start with minimum discount
  let discountPercent = this.config.MIN_DISCOUNT_PERCENT;
  const incentives = [];
  
  // Factor 1: Reward loyalty behavior
  // Scouts with 3+ purchases get enhanced pricing
  if (behavioralData?.purchaseHistory?.totalPurchases >= 3) {
    discountPercent = this.config.LOYALTY_DISCOUNT_PERCENT;
    incentives.push({
      type: 'loyalty-discount',
      description: `${discountPercent}% loyalty discount`,
    });
  }
  
  // Factor 2: Inventory pressure
  // Higher stock levels warrant more aggressive discounting
  if (item.stock > 40) {
    discountPercent = Math.max(discountPercent, 15);
    incentives.push({
      type: 'clearance',
      description: 'Limited time clearance pricing',
    });
  }
  
  // Factor 3: Budget constraints
  // Match Scout's budget if within acceptable margins
  if (constraints?.maxPrice) {
    const targetDiscount = ((basePrice - constraints.maxPrice) / basePrice) * 100;
    
    if (targetDiscount > discountPercent && 
        targetDiscount <= this.config.MAX_DISCOUNT_PERCENT) {
      discountPercent = Math.min(targetDiscount, this.config.MAX_DISCOUNT_PERCENT);
    }
  }
  
  // Calculate final offered price
  const offeredPrice = basePrice * (1 - discountPercent / 100);
  
  return {
    basePrice,
    offeredPrice: Math.round(offeredPrice * 100) / 100,
    discountPercent: Math.round(discountPercent * 100) / 100,
    incentives,
  };
}
```

### Python Style

Follow [PEP 8](https://www.python.org/dev/peps/pep-0008/) and use type hints:

```python
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class PricingResult:
    """
    Result of a dynamic pricing calculation.
    
    Attributes:
        base_price: Original item price
        offered_price: Calculated offer price
        discount_percent: Applied discount percentage
        incentives: Additional incentives offered
    """
    base_price: float
    offered_price: float
    discount_percent: float
    incentives: List[Dict[str, str]]

def calculate_dynamic_pricing(
    proposition_id: str,
    behavioral_data: Optional[Dict],
    constraints: Optional[Dict]
) -> PricingResult:
    """
    Calculate dynamic pricing based on scout behavior and constraints.
    
    This implements a multi-factor pricing algorithm that considers
    historical behavior, inventory levels, and budget constraints.
    
    Args:
        proposition_id: The proposition being negotiated
        behavioral_data: Scout's historical behavior patterns
        constraints: Scout's stated constraints
        
    Returns:
        PricingResult containing calculated pricing details
        
    Raises:
        ValueError: If proposition_id is invalid
    """
    # Implementation
    pass
```

### Go Style

Follow [Effective Go](https://golang.org/doc/effective_go) guidelines:

```go
package pricing

// PricingResult contains the result of a dynamic pricing calculation.
type PricingResult struct {
    // BasePrice is the original item price
    BasePrice float64
    
    // OfferedPrice is the calculated offer price
    OfferedPrice float64
    
    // DiscountPercent is the applied discount percentage
    DiscountPercent float64
    
    // Incentives are additional incentives offered
    Incentives []Incentive
}

// CalculateDynamicPricing calculates optimal pricing based on multiple factors.
//
// This implements a multi-factor pricing algorithm that considers:
// - Historical purchase behavior (loyalty)
// - Current inventory levels
// - Scout's budget constraints
//
// The algorithm weights these factors to arrive at an optimal price that
// maximizes conversion while maintaining margin requirements.
func CalculateDynamicPricing(
    propositionID string,
    behavioralData *BehavioralData,
    constraints *Constraints,
) (*PricingResult, error) {
    // Implementation
}
```

## Testing Requirements

### Test Coverage

- **Minimum coverage**: 80% for all new code
- **Critical paths**: 100% coverage required
- **Unit tests**: For individual functions/methods
- **Integration tests**: For component interactions
- **End-to-end tests**: For complete workflows

### Writing Tests

**JavaScript (Jest)**:
```javascript
describe('ClientManager', () => {
  let clientManager;
  
  beforeEach(() => {
    clientManager = new ClientManager();
  });
  
  describe('registerClient', () => {
    it('should register a new Scout client', async () => {
      const result = await clientManager.registerClient({
        type: 'scout',
        name: 'Test Scout',
        capabilities: ['negotiation'],
      });
      
      expect(result.clientId).toMatch(/^sct_/);
      expect(result.apiKey).toMatch(/^ak_/);
      expect(result.status).toBe('active');
    });
    
    it('should reject invalid client types', async () => {
      await expect(
        clientManager.registerClient({
          type: 'invalid',
          name: 'Test Client',
        })
      ).rejects.toThrow('Invalid client type');
    });
  });
  
  describe('trust score calculation', () => {
    it('should increase trust score with successful transactions', () => {
      // Setup
      const clientId = 'test_client';
      clientManager.clients.set(clientId, {
        trustScore: 0.5,
        reputationData: {
          transactionCount: 10,
          successfulTransactions: 8,
          // ... other fields
        },
      });
      
      // Execute
      const newScore = clientManager.updateTrustScore(clientId);
      
      // Assert
      expect(newScore).toBeGreaterThan(0.5);
    });
  });
});
```

**Running Tests**:
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- client-management.test.js

# Watch mode
npm test -- --watch
```

## Documentation Standards

### Code Documentation

Every module should include:

1. **Module header**: Purpose, version, and overview
2. **Function/method documentation**: Parameters, return values, exceptions
3. **Complex algorithm explanations**: Why, not just what
4. **Usage examples**: For public APIs
5. **Edge cases**: Known limitations or special behaviors

### README Files

Each major component should have a README with:

- **Purpose**: What the component does
- **Quick Start**: Minimal example to get started
- **API Reference**: Key interfaces and methods
- **Configuration**: Available options
- **Examples**: Common use cases
- **Troubleshooting**: Known issues and solutions

### Architecture Documentation

When adding new components:

1. Update [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
2. Add component diagrams if applicable
3. Document data flows
4. Explain design decisions

## Pull Request Process

### Before Submitting

Checklist:
- [ ] Code follows style guidelines
- [ ] All tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated
- [ ] No linting errors
- [ ] Commit messages are clear and descriptive

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(beacon): add loyalty-based dynamic pricing

Implements a multi-factor pricing algorithm that considers:
- Historical purchase behavior
- Current inventory levels
- Scout budget constraints

Closes #123

---

fix(client-manager): prevent race condition in session validation

The session validation logic had a race condition when multiple
requests arrived simultaneously. This adds proper locking.

Fixes #456

---

docs(architecture): clarify proposition discovery flow

Updates the architecture documentation to better explain how
Scouts discover and filter propositions.
```

### Submitting a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Reference related issues
   - Provide context and motivation
   - Include screenshots for UI changes
   - List breaking changes if any

3. **PR Template** (we'll add a template):
   ```markdown
   ## Description
   Brief description of changes
   
   ## Motivation and Context
   Why is this change needed?
   
   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   
   ## Testing
   How was this tested?
   
   ## Checklist
   - [ ] Tests pass locally
   - [ ] Documentation updated
   - [ ] No linting errors
   ```

4. **Address review feedback**:
   - Respond to comments
   - Make requested changes
   - Push updates to the same branch

5. **After approval**:
   - Squash commits if requested
   - Maintainer will merge

## Community

### Getting Help

- **Discord**: Join our [Discord server](https://discord.gg/aura-framework)
- **Forum**: Post on [discussions.aura-framework.org](https://discussions.aura-framework.org)
- **GitHub Issues**: For bugs and feature requests
- **Stack Overflow**: Tag questions with `aura-framework`

### Communication Guidelines

- Be respectful and constructive
- Provide context and details
- Share code examples when asking for help
- Search existing issues before creating new ones

### Recognition

Contributors will be recognized:
- Listed in [CONTRIBUTORS.md](./CONTRIBUTORS.md)
- Mentioned in release notes
- Featured in monthly contributor spotlights

## Areas for Contribution

We especially welcome contributions in:

1. **Core Protocol Development**
   - Protocol specification enhancements
   - Message format optimizations
   - Security improvements

2. **Reference Implementations**
   - Additional Beacon templates
   - Scout SDK development
   - Client libraries in various languages

3. **Developer Tools**
   - Testing frameworks
   - Debugging utilities
   - Monitoring dashboards

4. **Documentation**
   - Tutorials and guides
   - API documentation
   - Architecture diagrams

5. **Examples and Templates**
   - Industry-specific Beacons
   - Integration examples
   - Best practice demonstrations

## Questions?

If you have questions about contributing, reach out:

- **Email**: [email protected]
- **Discord**: @maintainers channel
- **Twitter**: [@AuraFramework](https://twitter.com/AuraFramework)

Thank you for contributing to AURA! 🚀
