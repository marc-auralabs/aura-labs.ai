/**
 * AURA Intent Parser — Alpha (TEMPORARY)
 *
 * Regex-based intent extraction. No LLM dependency.
 *
 * REPLACEMENT PLAN:
 *   This entire file gets replaced when Granite LLM is wired in.
 *   The only thing downstream code depends on is the parseIntent() signature:
 *
 *     parseIntent(rawIntent: string, constraints?: object) → {
 *       structured_requirements: { keywords, category, quantity, price_range, delivery, features },
 *       natural_language_context: string,
 *       confidence: number (0.0–1.0),
 *     }
 *
 *   Keep that contract. Replace everything else.
 */

// ─── Stopwords (filtered from keyword extraction) ───
const STOPWORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'they', 'them', 'their',
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'can', 'may', 'might', 'shall', 'must',
  'not', 'no', 'nor', 'so', 'too', 'very', 'just', 'also',
  'and', 'but', 'or', 'if', 'then', 'else', 'when', 'while', 'as',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'need', 'want', 'looking', 'find', 'get', 'buy', 'purchase', 'order', 'search',
  'please', 'help', 'some', 'any', 'each', 'every', 'all', 'both',
  'than', 'more', 'less', 'most', 'least', 'much', 'many', 'few',
  'here', 'there', 'where', 'how', 'what', 'which', 'who', 'whom',
  'something', 'anything', 'everything', 'nothing',
]);

// ─── Currency Symbols ───
const CURRENCY_MAP = {
  '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY',
  'usd': 'USD', 'gbp': 'GBP', 'eur': 'EUR', 'jpy': 'JPY',
  'dollars': 'USD', 'pounds': 'GBP', 'euros': 'EUR',
};

// ─── Quantity Words ───
const QUANTITY_WORDS = {
  'a': 1, 'one': 1, 'single': 1,
  'two': 2, 'couple': 2, 'pair': 2,
  'three': 3, 'few': 3,
  'four': 4, 'five': 5, 'six': 6,
  'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'dozen': 12, 'hundred': 100, 'thousand': 1000,
};

// ─── Common Product Categories ───
const CATEGORIES = [
  'electronics', 'software', 'hardware', 'clothing', 'food', 'furniture',
  'office supplies', 'industrial', 'automotive', 'medical', 'chemicals',
  'packaging', 'textiles', 'metals', 'plastics', 'components', 'tools',
  'machinery', 'equipment', 'services', 'consulting', 'logistics',
  'raw materials', 'fasteners', 'widgets', 'parts', 'supplies',
];

// ─── Feature Adjectives ───
const ADJECTIVES = new Set([
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'purple', 'orange', 'pink', 'grey', 'gray',
  'large', 'small', 'medium', 'big', 'tiny', 'huge', 'compact', 'mini',
  'heavy', 'light', 'lightweight', 'durable', 'sturdy', 'strong', 'tough',
  'fast', 'quick', 'slow', 'rapid', 'efficient',
  'cheap', 'expensive', 'affordable', 'premium', 'luxury', 'budget',
  'new', 'used', 'refurbished', 'certified', 'genuine', 'authentic',
  'organic', 'sustainable', 'recyclable', 'biodegradable', 'eco-friendly',
  'wireless', 'bluetooth', 'waterproof', 'stainless', 'galvanized',
  'custom', 'standard', 'industrial', 'commercial', 'residential',
  'high-quality', 'professional', 'medical-grade', 'food-grade',
]);


/**
 * Extract quantity from natural language.
 * Matches: "500 units", "a dozen", "100 widgets", "5,000 pieces"
 */
function extractQuantity(text) {
  // Numeric patterns: "500 units", "5,000 pieces", "100 widgets"
  const numericMatch = text.match(/(\d[\d,]*)\s*(units?|pieces?|items?|sets?|boxes?|cases?|packs?|lots?|rolls?|sheets?|pallets?|containers?|kg|lbs?|tons?|liters?|gallons?|meters?|feet|yards?)?/i);
  if (numericMatch) {
    const amount = parseInt(numericMatch[1].replace(/,/g, ''), 10);
    if (amount > 0 && amount < 100_000_000) {
      const rawUnit = (numericMatch[2] || 'units').toLowerCase();
      const unit = rawUnit.replace(/ies$/, 'y').replace(/xes$/, 'x').replace(/ses$/, 'se').replace(/s$/, '');
      return { amount, unit };
    }
  }

  // Word-based: "a dozen", "five hundred"
  const lower = text.toLowerCase();
  for (const [word, num] of Object.entries(QUANTITY_WORDS)) {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    if (pattern.test(lower)) {
      // Check for compound: "five hundred" → 500
      if (word === 'hundred') {
        const compoundMatch = lower.match(/(\w+)\s+hundred/);
        if (compoundMatch && QUANTITY_WORDS[compoundMatch[1]]) {
          return { amount: QUANTITY_WORDS[compoundMatch[1]] * 100, unit: 'units' };
        }
        return { amount: 100, unit: 'units' };
      }
      if (word === 'thousand') {
        const compoundMatch = lower.match(/(\w+)\s+thousand/);
        if (compoundMatch && QUANTITY_WORDS[compoundMatch[1]]) {
          return { amount: QUANTITY_WORDS[compoundMatch[1]] * 1000, unit: 'units' };
        }
        return { amount: 1000, unit: 'units' };
      }
      if (word === 'dozen') {
        const compoundMatch = lower.match(/(\w+)\s+dozen/);
        if (compoundMatch && QUANTITY_WORDS[compoundMatch[1]]) {
          return { amount: QUANTITY_WORDS[compoundMatch[1]] * 12, unit: 'units' };
        }
        return { amount: 12, unit: 'units' };
      }
      // Skip "a" unless followed by quantity noun
      if (word === 'a' || word === 'single') continue;
      return { amount: num, unit: 'units' };
    }
  }

  return null;
}


/**
 * Extract price range from natural language.
 * Matches: "$50", "under €100", "max $1000", "$50-$100", "between 50 and 100 dollars"
 */
function extractPriceRange(text) {
  let min = null;
  let max = null;
  let currency = 'USD'; // default

  // Detect currency from symbols or words
  for (const [symbol, curr] of Object.entries(CURRENCY_MAP)) {
    if (text.includes(symbol) || text.toLowerCase().includes(symbol)) {
      currency = curr;
      break;
    }
  }

  // Range: "$50-$100", "€50 to €100", "between 50 and 100"
  const rangeMatch = text.match(/[$£€]?\s*(\d[\d,.]*)\s*[-–to]+\s*[$£€]?\s*(\d[\d,.]*)/i);
  if (rangeMatch) {
    min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (min > max) [min, max] = [max, min];
    return { min, max, currency };
  }

  // "between X and Y"
  const betweenMatch = text.match(/between\s+[$£€]?\s*(\d[\d,.]*)\s+and\s+[$£€]?\s*(\d[\d,.]*)/i);
  if (betweenMatch) {
    min = parseFloat(betweenMatch[1].replace(/,/g, ''));
    max = parseFloat(betweenMatch[2].replace(/,/g, ''));
    if (min > max) [min, max] = [max, min];
    return { min, max, currency };
  }

  // Maximum: "max $1000", "under $500", "no more than €200", "up to $50", "below $100"
  const maxMatch = text.match(/(?:max|maximum|under|below|up\s+to|no\s+more\s+than|at\s+most|less\s+than)\s+[$£€]?\s*(\d[\d,.]*)/i);
  if (maxMatch) {
    max = parseFloat(maxMatch[1].replace(/,/g, ''));
    return { min: null, max, currency };
  }

  // "each" pricing: "$50 each", "$50/unit", "$50 per unit"
  const eachMatch = text.match(/[$£€]\s*(\d[\d,.]*)\s*(?:each|per\s+unit|\/unit|apiece)/i);
  if (eachMatch) {
    const price = parseFloat(eachMatch[1].replace(/,/g, ''));
    return { min: null, max: price, currency };
  }

  // Minimum: "at least $50", "minimum $100", "starting at $200"
  const minMatch = text.match(/(?:at\s+least|minimum|min|starting\s+at|from|above|over|more\s+than)\s+[$£€]?\s*(\d[\d,.]*)/i);
  if (minMatch) {
    min = parseFloat(minMatch[1].replace(/,/g, ''));
    return { min, max: null, currency };
  }

  // Standalone price: "$50", "€100" (treat as approximate target)
  const standaloneMatch = text.match(/[$£€]\s*(\d[\d,.]*)/);
  if (standaloneMatch) {
    const price = parseFloat(standaloneMatch[1].replace(/,/g, ''));
    // Treat as max with some headroom
    return { min: null, max: price, currency };
  }

  return null;
}


/**
 * Extract delivery window from natural language.
 * Matches: "within 3 days", "by Friday", "next week", "urgent", "ASAP"
 */
function extractDelivery(text) {
  const lower = text.toLowerCase();

  // Explicit days: "within 3 days", "in 5 business days"
  const daysMatch = lower.match(/(?:within|in|under)\s+(\d+)\s+(?:business\s+)?days?/);
  if (daysMatch) {
    return { within_days: parseInt(daysMatch[1], 10) };
  }

  // Weeks: "within 2 weeks", "in 4 weeks"
  const weeksMatch = lower.match(/(?:within|in|under)\s+(\d+)\s+weeks?/);
  if (weeksMatch) {
    return { within_days: parseInt(weeksMatch[1], 10) * 7 };
  }

  // Months: "within 1 month", "in 2 months"
  const monthsMatch = lower.match(/(?:within|in|under)\s+(\d+)\s+months?/);
  if (monthsMatch) {
    return { within_days: parseInt(monthsMatch[1], 10) * 30 };
  }

  // Named timeframes
  if (/\b(urgent|asap|immediately|right\s+away|rush)\b/.test(lower)) {
    return { within_days: 1 };
  }
  if (/\btomorrow\b/.test(lower)) {
    return { within_days: 1 };
  }
  if (/\bnext\s+day\b/.test(lower)) {
    return { within_days: 1 };
  }
  if (/\b(this\s+week|by\s+friday|end\s+of\s+week)\b/.test(lower)) {
    return { within_days: 5 };
  }
  if (/\bnext\s+week\b/.test(lower)) {
    return { within_days: 7 };
  }
  if (/\b(this\s+month|end\s+of\s+month)\b/.test(lower)) {
    return { within_days: 30 };
  }
  if (/\bnext\s+month\b/.test(lower)) {
    return { within_days: 60 };
  }

  return null;
}


/**
 * Extract feature adjectives from text.
 * Looks for known adjectives preceding nouns.
 */
function extractFeatures(text) {
  const words = text.toLowerCase().match(/[\w-]+/g) || [];
  const features = [];

  for (let i = 0; i < words.length; i++) {
    if (ADJECTIVES.has(words[i])) {
      features.push(words[i]);
    }
    // Compound adjectives: "high-quality", "food-grade"
    if (i < words.length - 1) {
      const compound = `${words[i]}-${words[i + 1]}`;
      if (ADJECTIVES.has(compound)) {
        features.push(compound);
      }
    }
  }

  return [...new Set(features)]; // deduplicate
}


/**
 * Extract keywords (significant words after stopword removal).
 */
function extractKeywords(text) {
  const words = text.toLowerCase().match(/[\w-]+/g) || [];
  return [...new Set(
    words.filter(w => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  )];
}


/**
 * Infer product category from keywords.
 */
function inferCategory(keywords) {
  for (const cat of CATEGORIES) {
    const catWords = cat.split(' ');
    if (catWords.some(cw => keywords.includes(cw))) {
      return cat;
    }
  }
  return null;
}


/**
 * Main parsing function.
 *
 * @param {string} rawIntent - Natural language intent from user
 * @param {Object} [constraints] - Optional structured constraints from client
 * @returns {Object} Parsed intent with structured requirements and confidence
 */
function parseIntent(rawIntent, constraints) {
  if (!rawIntent || typeof rawIntent !== 'string') {
    return {
      structured_requirements: {
        keywords: [],
        category: null,
        quantity: null,
        price_range: null,
        delivery: null,
        features: [],
      },
      natural_language_context: rawIntent || '',
      confidence: 0.1,
    };
  }

  const text = rawIntent.trim();

  // Extract all components
  const keywords = extractKeywords(text);
  const quantity = extractQuantity(text);
  const priceRange = extractPriceRange(text);
  const delivery = extractDelivery(text);
  const features = extractFeatures(text);
  const category = inferCategory(keywords);

  // Build structured requirements
  const structured = {
    keywords,
    category,
    quantity,
    price_range: priceRange,
    delivery,
    features,
  };

  // Merge with explicit constraints (constraints override inferred values)
  if (constraints && typeof constraints === 'object') {
    if (constraints.category) structured.category = constraints.category;
    if (constraints.quantity) structured.quantity = constraints.quantity;
    if (constraints.price_range || constraints.priceRange) {
      structured.price_range = constraints.price_range || constraints.priceRange;
    }
    if (constraints.delivery) structured.delivery = constraints.delivery;
    if (constraints.features && Array.isArray(constraints.features)) {
      structured.features = [...new Set([...structured.features, ...constraints.features])];
    }
    if (constraints.keywords && Array.isArray(constraints.keywords)) {
      structured.keywords = [...new Set([...structured.keywords, ...constraints.keywords])];
    }
  }

  // Compute confidence based on extraction success
  let confidence = 0.3; // base: we have at least raw text
  if (keywords.length > 0) confidence += 0.1;
  if (quantity) confidence += 0.15;
  if (priceRange) confidence += 0.15;
  if (delivery) confidence += 0.15;
  if (features.length > 0) confidence += 0.1;
  if (category) confidence += 0.05;
  confidence = Math.min(confidence, 1.0);

  return {
    structured_requirements: structured,
    natural_language_context: text,
    confidence: Math.round(confidence * 100) / 100,
  };
}


// Public API — this is the only function downstream code should use
export { parseIntent };

// Internals — exported for tests only, not part of the contract
export { extractQuantity, extractPriceRange, extractDelivery, extractFeatures, extractKeywords };
