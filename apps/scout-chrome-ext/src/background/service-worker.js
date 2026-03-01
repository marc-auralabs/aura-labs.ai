/**
 * AURA Scout Service Worker
 *
 * Background service worker for the Chrome extension (Manifest V3).
 * Routes messages between the side panel, popup, and content scripts.
 * Owns the singleton SessionManager instance.
 *
 * Auto-initialization:
 *   On install or startup, generates Ed25519 keys and registers with
 *   AURA Core. No API key or manual setup required.
 */

import { SessionManager } from '../lib/session-manager.js';
import { MessageType } from '../shared/constants.js';

const sessionManager = new SessionManager();

/**
 * Initialise the session manager — auto-registers with AURA Core.
 * No API key needed; identity is cryptographic (Ed25519).
 */
async function initialise() {
  try {
    await sessionManager.init();
    console.log('[AURA] Agent registered:', sessionManager.agentId);
  } catch (error) {
    console.error('[AURA] Initialization failed:', error.message);
    // Will retry on next message that requires readiness
  }
}

// Initialise on service worker startup
initialise();

/**
 * Open side panel when extension icon is clicked.
 * No popup needed — registration is automatic.
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

/**
 * Forward session manager events to all extension contexts.
 */
function broadcastEvent(eventName, detail) {
  const message = { type: eventName, ...detail };
  chrome.runtime.sendMessage(message).catch(() => {
    // Receiver may not be open — safe to ignore
  });
}

sessionManager.addEventListener('state-change', (e) => {
  broadcastEvent(MessageType.SESSION_UPDATED, {
    state: e.detail.current,
    previousState: e.detail.previous,
    session: sessionManager.session,
    offers: sessionManager.offers,
    selectedOffer: sessionManager.selectedOffer,
    mandates: sessionManager.mandates,
    transaction: sessionManager.transaction,
  });
});

sessionManager.addEventListener('offers-ready', (e) => {
  broadcastEvent(MessageType.OFFERS_READY, { offers: e.detail });
});

sessionManager.addEventListener('error', (e) => {
  broadcastEvent(MessageType.ERROR, { error: e.detail });
});

sessionManager.addEventListener('mandate-created', (e) => {
  broadcastEvent(MessageType.MANDATE_CREATED, e.detail);
});

/**
 * Handle incoming messages from popup, side panel, and content scripts.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ error: error.message });
  });
  return true; // Keep message channel open for async response
});

/**
 * Route messages to the appropriate handler.
 */
async function handleMessage(message, sender) {
  // Ensure initialization before handling requests that need it
  if (!sessionManager.isReady && message.type !== MessageType.HEALTH_CHECK) {
    await initialise();
  }

  switch (message.type) {
    case MessageType.HEALTH_CHECK: {
      return {
        ok: sessionManager.isReady,
        agentId: sessionManager.agentId,
        ready: sessionManager.isReady,
      };
    }

    case MessageType.CREATE_SESSION: {
      const session = await sessionManager.startSession(
        message.intent,
        message.constraints
      );
      return { ok: true, session };
    }

    case MessageType.CANCEL_SESSION: {
      await sessionManager.cancelSession();
      return { ok: true };
    }

    case MessageType.SELECT_OFFER: {
      sessionManager.selectOffer(message.offerId);
      return { ok: true, offer: sessionManager.selectedOffer };
    }

    case MessageType.CREATE_INTENT_MANDATE: {
      sessionManager.setMandate('intent', message.mandate);
      return { ok: true };
    }

    case MessageType.CREATE_CART_MANDATE: {
      sessionManager.setMandate('cart', message.mandate);
      return { ok: true };
    }

    case MessageType.CREATE_PAYMENT_MANDATE: {
      sessionManager.setMandate('payment', message.mandate);
      return { ok: true };
    }

    case MessageType.COMMIT_OFFER: {
      const transaction = await sessionManager.commitOffer();
      return { ok: true, transaction };
    }

    case MessageType.PRODUCT_EXTRACTED: {
      return { ok: true, product: message.product };
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` };
  }
}
