// UNVERIFIED DRAFT adapter for Gemini.
// Selectors are a fallback list, NOT live-verified like muse.ai.
// If none match, the content script returns a named error instead of sending.
window.VoiceAdapter = {
  site: 'gemini',
  chatBoxSelectors: ['div.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea'],
  sendSelectors: ['button[aria-label="Send message"]', 'button[aria-label="Send"]'],
  assistantSelectors: ['div.model-response-text'],
  userSelectors: []
};
