/**
 * AURA Scout Side Panel
 *
 * Renders the side panel UI based on state updates from the service worker.
 * Implements the 7-state UI state machine:
 *   IDLE → INTENT_INPUT → SEARCHING → OFFERS_READY → MANDATE_FLOW → CHECKOUT → CONFIRMATION
 *
 * All business logic lives in the SessionManager (via service worker).
 * This module is purely presentational + event dispatch.
 */

import { MessageType, UIState, MandateStep } from '../shared/constants.js';

// =========================================================================
// DOM References
// =========================================================================

const views = {
  [UIState.IDLE]: document.getElementById('view-idle'),
  [UIState.INTENT_INPUT]: document.getElementById('view-intent'),
  [UIState.SEARCHING]: document.getElementById('view-searching'),
  [UIState.OFFERS_READY]: document.getElementById('view-offers'),
  [UIState.MANDATE_FLOW]: document.getElementById('view-mandates'),
  [UIState.CHECKOUT]: document.getElementById('view-checkout'),
  [UIState.CONFIRMATION]: document.getElementById('view-confirmation'),
  [UIState.ERROR]: document.getElementById('view-error'),
};

const elements = {
  intentInput: document.getElementById('intent-input'),
  budgetInput: document.getElementById('budget-input'),
  categoryInput: document.getElementById('category-input'),
  deliveryInput: document.getElementById('delivery-input'),
  constraintsToggle: document.getElementById('constraints-toggle'),
  constraintsPanel: document.getElementById('constraints-panel'),
  offersList: document.getElementById('offers-list'),
  confirmationDetails: document.getElementById('confirmation-details'),
  errorTitle: document.getElementById('error-title'),
  errorMessage: document.getElementById('error-message'),
};

// =========================================================================
// State Management
// =========================================================================

let currentState = UIState.IDLE;
let sessionData = null;

/**
 * Switch the visible view.
 *
 * @param {string} state - UIState value
 */
function showView(state) {
  currentState = state;
  for (const [viewState, el] of Object.entries(views)) {
    if (el) {
      el.classList.toggle('hidden', viewState !== state);
    }
  }
}

// =========================================================================
// Message Handling
// =========================================================================

/**
 * Send a message to the service worker and return the response.
 *
 * @param {Object} message - { type, ...payload }
 * @returns {Promise<Object>} Response from service worker
 */
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

/**
 * Listen for broadcast messages from the service worker.
 */
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case MessageType.SESSION_UPDATED:
      sessionData = message;
      if (message.state) {
        showView(message.state);
      }
      break;

    case MessageType.OFFERS_READY:
      renderOffers(message.offers);
      break;

    case MessageType.MANDATE_CREATED:
      renderMandateStep(message.type, message.mandate);
      break;

    case MessageType.ERROR:
      showError(message.error?.message || 'An unexpected error occurred');
      break;
  }
});

// =========================================================================
// UI Rendering
// =========================================================================

/**
 * Render offer cards.
 *
 * @param {Array} offers
 */
function renderOffers(offers) {
  const list = elements.offersList;
  list.innerHTML = '';

  if (!offers || offers.length === 0) {
    list.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">No offers found. Try adjusting your search.</p>';
    return;
  }

  for (const offer of offers) {
    const card = document.createElement('div');
    card.className = 'offer-card';
    card.innerHTML = `
      <div class="offer-vendor">${escapeHtml(offer.beaconName || 'Unknown Vendor')}</div>
      <div class="offer-product">${escapeHtml(offer.product?.name || 'Product')}</div>
      <div class="offer-meta">
        <span class="offer-price">$${formatPrice(offer.totalPrice)}</span>
        <span class="offer-delivery">${offer.deliveryDate ? `Delivers ${offer.deliveryDate}` : ''}</span>
      </div>
      ${offer.terms ? `<div class="muted" style="margin-top:6px;font-size:12px;">${escapeHtml(offer.terms)}</div>` : ''}
      <button class="btn btn-sm btn-primary offer-select-btn" data-offer-id="${offer.id}">Select Offer</button>
    `;
    list.appendChild(card);
  }
}

/**
 * Render mandate step completion.
 */
function renderMandateStep(type, mandate) {
  const stepEl = document.getElementById(`mandate-step-${type}`);
  if (!stepEl) return;

  const indicator = stepEl.querySelector('.step-indicator');
  indicator.classList.remove('locked');
  indicator.classList.add('completed');
  indicator.innerHTML = '&#10003;';

  stepEl.classList.add('completed');

  const details = stepEl.querySelector('.mandate-details');
  if (details && mandate) {
    details.classList.remove('hidden');
    details.textContent = JSON.stringify(mandate, null, 2);
  }

  // Unlock next step
  unlockNextMandateStep(type);
}

/**
 * Unlock the next mandate step button.
 */
function unlockNextMandateStep(completedType) {
  const order = [MandateStep.INTENT, MandateStep.CART, MandateStep.PAYMENT];
  const idx = order.indexOf(completedType);

  if (idx < order.length - 1) {
    const nextType = order[idx + 1];
    const nextStep = document.getElementById(`mandate-step-${nextType}`);
    if (nextStep) {
      const indicator = nextStep.querySelector('.step-indicator');
      indicator.classList.remove('locked');
      const btn = nextStep.querySelector('.btn');
      if (btn) btn.classList.remove('hidden');
    }
  }
}

/**
 * Render confirmation details.
 */
function renderConfirmation(transaction, offer) {
  const el = elements.confirmationDetails;
  el.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Order ID</span>
      <span class="detail-value">${transaction?.transactionId || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status</span>
      <span class="detail-value">${transaction?.status || 'committed'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Vendor</span>
      <span class="detail-value">${offer?.beaconName || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Product</span>
      <span class="detail-value">${offer?.product?.name || 'N/A'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Total</span>
      <span class="detail-value">$${formatPrice(offer?.totalPrice)}</span>
    </div>
  `;
}

/**
 * Show error state.
 */
function showError(message) {
  elements.errorMessage.textContent = message;
  showView(UIState.ERROR);
}

// =========================================================================
// Event Listeners
// =========================================================================

// Idle → Intent Input
document.getElementById('start-btn').addEventListener('click', () => {
  showView(UIState.INTENT_INPUT);
});

// Constraints toggle
elements.constraintsToggle.addEventListener('click', () => {
  elements.constraintsToggle.classList.toggle('active');
  elements.constraintsPanel.classList.toggle('hidden');
});

// Find Offers
document.getElementById('find-btn').addEventListener('click', async () => {
  const intent = elements.intentInput.value.trim();
  if (!intent) return;

  const constraints = {};
  const budget = elements.budgetInput.value;
  if (budget) constraints.maxBudget = parseFloat(budget);

  const category = elements.categoryInput.value;
  if (category) constraints.categories = [category];

  const delivery = elements.deliveryInput.value;
  if (delivery) constraints.deliveryBy = delivery;

  showView(UIState.SEARCHING);

  const response = await sendMessage({
    type: MessageType.CREATE_SESSION,
    intent,
    constraints,
  });

  if (response?.error) {
    showError(response.error);
  }
});

// Cancel buttons
document.getElementById('cancel-intent-btn').addEventListener('click', () => {
  showView(UIState.IDLE);
});

document.getElementById('cancel-search-btn').addEventListener('click', async () => {
  await sendMessage({ type: MessageType.CANCEL_SESSION });
  showView(UIState.IDLE);
});

// Offer selection (event delegation)
elements.offersList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-offer-id]');
  if (!btn) return;

  const offerId = btn.dataset.offerId;
  await sendMessage({ type: MessageType.SELECT_OFFER, offerId });
});

// Mandate approvals
document.getElementById('approve-intent-btn').addEventListener('click', async () => {
  await sendMessage({
    type: MessageType.CREATE_INTENT_MANDATE,
    mandate: { type: 'intent', approved: true, timestamp: new Date().toISOString() },
  });
  renderMandateStep(MandateStep.INTENT, { status: 'approved' });
});

document.getElementById('approve-cart-btn').addEventListener('click', async () => {
  await sendMessage({
    type: MessageType.CREATE_CART_MANDATE,
    mandate: { type: 'cart', approved: true, timestamp: new Date().toISOString() },
  });
  renderMandateStep(MandateStep.CART, { status: 'approved' });
});

document.getElementById('approve-payment-btn').addEventListener('click', async () => {
  await sendMessage({
    type: MessageType.CREATE_PAYMENT_MANDATE,
    mandate: { type: 'payment', approved: true, timestamp: new Date().toISOString() },
  });
  renderMandateStep(MandateStep.PAYMENT, { status: 'approved' });

  // Trigger checkout after payment mandate
  const response = await sendMessage({ type: MessageType.COMMIT_OFFER });
  if (response?.transaction) {
    renderConfirmation(response.transaction, sessionData?.selectedOffer);
  }
});

// Back to offers
document.getElementById('back-to-offers-btn').addEventListener('click', () => {
  showView(UIState.OFFERS_READY);
});

// New search from offers
document.getElementById('new-search-btn').addEventListener('click', async () => {
  await sendMessage({ type: MessageType.CANCEL_SESSION });
  showView(UIState.INTENT_INPUT);
  elements.intentInput.value = '';
});

// New session from confirmation
document.getElementById('new-session-btn').addEventListener('click', () => {
  showView(UIState.INTENT_INPUT);
  elements.intentInput.value = '';
});

// Retry from error
document.getElementById('retry-btn').addEventListener('click', () => {
  showView(UIState.INTENT_INPUT);
});

// =========================================================================
// Utilities
// =========================================================================

/**
 * Escape HTML to prevent XSS in rendered content.
 * SECURITY: All user-supplied and API-supplied strings must pass through this.
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format a price value for display.
 */
function formatPrice(value) {
  if (value == null) return '0.00';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Initialise with idle view
showView(UIState.IDLE);
