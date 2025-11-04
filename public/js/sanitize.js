/**
 * HTML Sanitization Utility
 * Provides safe methods for rendering user-generated content
 * Uses DOMPurify to prevent XSS attacks
 */

// DOMPurify will be loaded via CDN in the HTML
// This module provides wrapper functions for safe HTML operations

/**
 * Safely set HTML content using DOMPurify
 * @param {HTMLElement} element - The element to set content on
 * @param {string} html - The HTML string to sanitize and set
 * @param {Object} config - Optional DOMPurify configuration
 */
function safeSetHTML(element, html, config = {}) {
  if (!element) {
    console.warn('safeSetHTML: element is null or undefined');
    return;
  }

  if (typeof html !== 'string') {
    console.warn('safeSetHTML: html is not a string, using textContent instead');
    element.textContent = String(html);
    return;
  }

  // Check if DOMPurify is available
  if (typeof DOMPurify === 'undefined') {
    console.error('DOMPurify is not loaded! Falling back to textContent for safety.');
    element.textContent = html;
    return;
  }

  // Default config: allow common safe tags
  const defaultConfig = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
    ...config
  };

  // Sanitize and set
  const clean = DOMPurify.sanitize(html, defaultConfig);
  element.innerHTML = clean;
}

/**
 * Safely set text content (no HTML allowed)
 * @param {HTMLElement} element - The element to set content on
 * @param {string} text - The text to set
 */
function safeSetText(element, text) {
  if (!element) {
    console.warn('safeSetText: element is null or undefined');
    return;
  }
  element.textContent = String(text);
}

/**
 * Sanitize HTML string and return it
 * @param {string} html - The HTML string to sanitize
 * @param {Object} config - Optional DOMPurify configuration
 * @returns {string} - Sanitized HTML string
 */
function sanitizeHTML(html, config = {}) {
  if (typeof html !== 'string') {
    return String(html);
  }

  if (typeof DOMPurify === 'undefined') {
    console.error('DOMPurify is not loaded! Returning empty string for safety.');
    return '';
  }

  const defaultConfig = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
    ...config
  };

  return DOMPurify.sanitize(html, defaultConfig);
}

/**
 * Escape HTML entities for safe display
 * @param {string} text - The text to escape
 * @returns {string} - Escaped text
 */
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create a safe element with text content
 * @param {string} tagName - The tag name (e.g., 'div', 'span')
 * @param {string} text - The text content
 * @param {string} className - Optional CSS class
 * @returns {HTMLElement} - The created element
 */
function createSafeElement(tagName, text, className = '') {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
}

// Export functions for use in other modules
if (typeof window !== 'undefined') {
  window.SafeHTML = {
    setHTML: safeSetHTML,
    setText: safeSetText,
    sanitize: sanitizeHTML,
    escape: escapeHTML,
    createElement: createSafeElement
  };
}
