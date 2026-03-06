/**
 * Product Extractor (Content Script)
 *
 * Runs on shopping pages to extract product information.
 * MVP: basic DOM scraping for common shopping site patterns.
 *
 * Sends extracted product data to the service worker, which
 * can pre-fill the intent input in the side panel.
 *
 * SECURITY: This script runs in the page context. Never send
 * sensitive extension data to the page. Only extract publicly
 * visible product information.
 */

(function () {
  'use strict';

  /**
   * Extract product information from the current page.
   *
   * @returns {Object|null} Extracted product data, or null if not a product page
   */
  function extractProduct() {
    // Try structured data first (JSON-LD)
    const jsonLd = extractJsonLd();
    if (jsonLd) return jsonLd;

    // Try Open Graph meta tags
    const og = extractOpenGraph();
    if (og) return og;

    // Try common DOM patterns
    const dom = extractFromDOM();
    if (dom) return dom;

    return null;
  }

  /**
   * Extract from JSON-LD structured data (Schema.org Product).
   */
  function extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const product = findProductInJsonLd(data);
        if (product) {
          return {
            source: 'json-ld',
            name: product.name || null,
            price: extractPrice(product.offers),
            currency: extractCurrency(product.offers),
            description: truncate(product.description, 200),
            sku: product.sku || null,
            brand: product.brand?.name || null,
            url: window.location.href,
          };
        }
      } catch {
        // Malformed JSON-LD — skip
      }
    }
    return null;
  }

  /**
   * Recursively find a Product object in JSON-LD data.
   */
  function findProductInJsonLd(data) {
    if (!data) return null;
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = findProductInJsonLd(item);
        if (found) return found;
      }
      return null;
    }
    if (data['@type'] === 'Product') return data;
    if (data['@graph']) return findProductInJsonLd(data['@graph']);
    return null;
  }

  /**
   * Extract from Open Graph meta tags.
   */
  function extractOpenGraph() {
    const title = getMeta('og:title');
    const price = getMeta('product:price:amount') || getMeta('og:price:amount');

    if (!title) return null;

    return {
      source: 'opengraph',
      name: title,
      price: price ? parseFloat(price) : null,
      currency: getMeta('product:price:currency') || getMeta('og:price:currency') || null,
      description: truncate(getMeta('og:description'), 200),
      sku: null,
      brand: getMeta('product:brand') || null,
      url: getMeta('og:url') || window.location.href,
    };
  }

  /**
   * Extract from common DOM patterns.
   */
  function extractFromDOM() {
    const name = getTextFromSelectors([
      'h1[itemprop="name"]',
      '#productTitle',
      '.product-title h1',
      '.product-name h1',
      'h1.product__title',
      '[data-testid="product-title"]',
      'h1',
    ]);

    if (!name) return null;

    const priceText = getTextFromSelectors([
      '[itemprop="price"]',
      '.price-current',
      '.product-price',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price .a-offscreen',
      '[data-testid="product-price"]',
      '.price',
    ]);

    return {
      source: 'dom',
      name: truncate(name, 200),
      price: priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) : null,
      currency: null,
      description: truncate(getMeta('description'), 200),
      sku: null,
      brand: null,
      url: window.location.href,
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  function getMeta(name) {
    const el = document.querySelector(
      `meta[property="${name}"], meta[name="${name}"]`
    );
    return el?.content?.trim() || null;
  }

  function getTextFromSelectors(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent?.trim()) {
        return el.textContent.trim();
      }
    }
    return null;
  }

  function extractPrice(offers) {
    if (!offers) return null;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    const price = offer?.price || offer?.lowPrice;
    return price ? parseFloat(price) : null;
  }

  function extractCurrency(offers) {
    if (!offers) return null;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    return offer?.priceCurrency || null;
  }

  function truncate(str, maxLen) {
    if (!str) return null;
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }

  // =========================================================================
  // Main
  // =========================================================================

  // Only run on pages that look like product pages
  const product = extractProduct();

  if (product && product.name) {
    // Send to service worker
    try {
      chrome.runtime.sendMessage({
        type: 'product_extracted',
        product,
      });
    } catch {
      // Extension context may not be available — safe to ignore
    }
  }
})();
