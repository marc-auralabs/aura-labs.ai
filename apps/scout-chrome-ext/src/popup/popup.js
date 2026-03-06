/**
 * AURA Scout Popup
 *
 * Shows agent status (auto-registered, no API key needed).
 * Provides button to open the side panel.
 */

import { MessageType } from '../shared/constants.js';

const statusEl = document.getElementById('status');
const agentInfoEl = document.getElementById('agent-info');
const agentIdDisplay = document.getElementById('agent-id-display');
const openPanelBtn = document.getElementById('open-panel-btn');

/**
 * Check agent registration status via service worker.
 */
async function checkStatus() {
  showStatus('loading', 'Connecting...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.HEALTH_CHECK,
    });

    if (response && response.ready && response.agentId) {
      showStatus('connected', 'Agent registered');
      agentInfoEl.style.display = 'block';
      agentIdDisplay.textContent = response.agentId;
    } else {
      showStatus('error', 'Not connected — initializing...');
    }
  } catch (error) {
    showStatus('error', 'Service worker not ready');
  }
}

/**
 * Open the side panel for the current tab.
 */
async function openSidePanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  } catch {
    showStatus('error', 'Could not open side panel');
  }
}

/**
 * Update the status indicator.
 */
function showStatus(type, message) {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
}

// Event listeners
openPanelBtn.addEventListener('click', openSidePanel);

// Check status on load
checkStatus();
