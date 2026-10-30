// UNVERIFIED DRAFT adapter for Perplexity AI.
// Selectors are a fallback list, NOT live-verified like muse.ai.
// If none match, the content script returns a named error instead of sending.
window.VoiceAdapter = {
  site: 'perplexity',
  chatBoxSelectors: ['textarea[placeholder*="Ask"]', 'textarea', 'div[contenteditable="true"]'],
  sendSelectors: ['button[aria-label="Submit"]', 'button[aria-label="Send"]'],
  assistantSelectors: [],
  userSelectors: []
};
