/**
 * Webhook Dispatcher Module for AURA Core API
 * Handles asynchronous delivery of webhook events to registered endpoints
 * with retry logic and exponential backoff.
 */

const RETRY_DELAYS = [1000, 2000, 4000]; // milliseconds
const REQUEST_TIMEOUT = 5000; // 5 seconds

/**
 * Dispatches a webhook event to a beacon endpoint
 * Fire-and-forget pattern - returns immediately, delivery happens async
 * @param {Object} beacon - Beacon object with id, endpoint_url, name
 * @param {string} eventType - Event type (e.g., 'transaction.committed')
 * @param {Object} payload - Payload to send as JSON
 * @param {Object} logger - Logger instance (info, warn, error methods)
 * @returns {void}
 */
export function dispatchWebhook(beacon, eventType, payload, logger) {
  // Return silently if no endpoint configured
  if (!beacon?.endpoint_url) {
    return;
  }

  // Start async work without waiting
  deliverWebhook(beacon, eventType, payload, logger);
}

/**
 * Internal async function to handle webhook delivery with retries
 * @private
 */
async function deliverWebhook(beacon, eventType, payload, logger) {
  const headers = {
    'Content-Type': 'application/json',
    'X-AURA-Event': eventType,
    'X-AURA-Timestamp': new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const maxAttempts = RETRY_DELAYS.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(beacon.endpoint_url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        logger.info({
          message: 'Webhook delivered successfully',
          beacon_id: beacon.id,
          beacon_name: beacon.name,
          event_type: eventType,
          attempt,
        });
        return;
      }

      // Non-2xx response - log and retry if attempts remain
      const errorMessage = `HTTP ${response.status}`;
      if (attempt < maxAttempts) {
        logger.warn({
          message: 'Webhook delivery failed, retrying',
          beacon_id: beacon.id,
          beacon_name: beacon.name,
          event_type: eventType,
          attempt,
          error: errorMessage,
        });
      } else {
        logger.error({
          message: 'Webhook delivery failed after all retries',
          beacon_id: beacon.id,
          beacon_name: beacon.name,
          event_type: eventType,
          final_attempt: attempt,
          error: errorMessage,
        });
        return;
      }
    } catch (error) {
      const isAbort = error.name === 'AbortError';
      const errorMessage = isAbort ? 'Request timeout' : error.message;

      if (attempt < maxAttempts) {
        logger.warn({
          message: 'Webhook delivery failed, retrying',
          beacon_id: beacon.id,
          beacon_name: beacon.name,
          event_type: eventType,
          attempt,
          error: errorMessage,
        });
      } else {
        logger.error({
          message: 'Webhook delivery failed after all retries',
          beacon_id: beacon.id,
          beacon_name: beacon.name,
          event_type: eventType,
          final_attempt: attempt,
          error: errorMessage,
        });
        return;
      }
    }

    // Wait before next retry (except after last attempt)
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }
  }
}
