/**
 * Shared utilities used across all route modules.
 *
 * - safeError: sanitize error messages for production responses
 * - versionedHref: build HATEOAS links with API version prefix
 * - isValidUUID: validate UUID format
 */

// Safe error messages — never leak internal details in production
export function safeError(error, fallbackMessage = 'An internal error occurred') {
  if (process.env.NODE_ENV !== 'production') return error.message;
  // Only return known safe error messages; everything else gets the fallback
  const safePatterns = [
    /not found/i, /invalid/i, /required/i, /already exists/i,
    /expired/i, /unauthorized/i, /forbidden/i, /missing/i,
  ];
  if (safePatterns.some(p => p.test(error.message))) return error.message;
  console.error('Suppressed error detail:', error.message);
  return fallbackMessage;
}

// Versioned HATEOAS helper — extracts version prefix from request URL
// so all _links.href values match the caller's declared API version.
export function versionedHref(request, path) {
  const match = request.url.match(/^\/(v\d+)/);
  const prefix = match ? `/${match[1]}` : '';
  return `${prefix}${path}`;
}

// UUID validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUUID(str) {
  return typeof str === 'string' && UUID_REGEX.test(str);
}
