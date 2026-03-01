/**
 * AURA Beacon Matcher — Alpha
 *
 * Queries registered beacons from PostgreSQL and scores them
 * against a parsed intent. Returns a ranked list of matching beacons.
 *
 * Scoring is based on keyword overlap between intent and beacon
 * capabilities. No external dependencies.
 */


/**
 * Compute relevance score (0–100) for a beacon against parsed intent.
 *
 * @param {Object} beacon - Beacon row from database
 * @param {Object} parsedIntent - Output from intent-parser.js
 * @returns {number} Score between 0 and 100
 */
function scoreBeacon(beacon, parsedIntent) {
  const { structured_requirements: req } = parsedIntent;
  if (!req) return 0;

  let score = 0;

  // Extract searchable text from beacon capabilities
  const capText = extractCapabilityText(beacon.capabilities);

  // 1. Keyword overlap: +15 per keyword match, max 60
  const intentKeywords = req.keywords || [];
  let keywordMatches = 0;
  for (const keyword of intentKeywords) {
    if (capText.includes(keyword.toLowerCase())) {
      keywordMatches++;
    }
  }
  score += Math.min(keywordMatches * 15, 60);

  // 2. Category match: +20
  if (req.category && capText.includes(req.category.toLowerCase())) {
    score += 20;
  }

  // 3. Active and reachable: +20 (baseline for being registered and active)
  if (beacon.status === 'active') {
    score += 20;
  }

  return Math.min(score, 100);
}


/**
 * Extract all searchable text from beacon capabilities JSONB.
 * Handles various structures: arrays, objects with products/categories/tags.
 */
function extractCapabilityText(capabilities) {
  if (!capabilities) return '';

  const parts = [];

  if (typeof capabilities === 'string') {
    parts.push(capabilities);
  } else if (Array.isArray(capabilities)) {
    for (const item of capabilities) {
      if (typeof item === 'string') parts.push(item);
      else if (typeof item === 'object') parts.push(JSON.stringify(item));
    }
  } else if (typeof capabilities === 'object') {
    // Common structures: { products: [...], categories: [...], tags: [...] }
    for (const [key, value] of Object.entries(capabilities)) {
      parts.push(key);
      if (typeof value === 'string') {
        parts.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') parts.push(item);
          else if (typeof item === 'object' && item.name) parts.push(item.name);
        }
      }
    }
  }

  return parts.join(' ').toLowerCase();
}


/**
 * Match beacons from the database against a parsed intent.
 *
 * @param {Object} db - PostgreSQL client (pg.Pool or pg.Client)
 * @param {Object} parsedIntent - Output from intent-parser.js
 * @param {Object} [options] - Options
 * @param {number} [options.limit=10] - Maximum number of beacons to return
 * @returns {Promise<Array>} Ranked list of matching beacons
 */
async function matchBeacons(db, parsedIntent, options = {}) {
  const { limit = 10 } = options;

  if (!db) return [];
  if (!parsedIntent || !parsedIntent.structured_requirements) return [];

  try {
    // Query all active beacons
    const result = await db.query(
      `SELECT id, external_id, name, description, endpoint_url, status, capabilities
       FROM beacons
       WHERE status = 'active'
       ORDER BY created_at DESC`
    );

    if (result.rows.length === 0) return [];

    // Score each beacon
    const scored = result.rows.map(beacon => ({
      beaconId: beacon.id,
      externalId: beacon.external_id,
      name: beacon.name,
      description: beacon.description,
      endpointUrl: beacon.endpoint_url,
      score: scoreBeacon(beacon, parsedIntent),
      capabilities: beacon.capabilities,
    }));

    // Filter to those with positive score, sort descending, limit
    return scored
      .filter(b => b.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    // Log but don't throw — matching failure shouldn't kill session creation
    console.error('[beacon-matcher] Query failed:', error.message);
    return [];
  }
}


export { matchBeacons, scoreBeacon, extractCapabilityText };
