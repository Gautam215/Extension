// UNVERIFIED DRAFT adapter for Grok (grok.com).
// Selectors are a fallback list, NOT live-verified like muse.ai.
// If none match, the content script returns a named error instead of sending.
window.VoiceAdapter = {
  site: 'grok',
  chatBoxSelectors: ['textarea', 'div[contenteditable="true"]'],
  sendSelectors: ['button[aria-label="Send"]', 'button[aria-label="Submit"]'],
  assistantSelectors: [],
  userSelectors: []
};
