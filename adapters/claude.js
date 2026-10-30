// UNVERIFIED DRAFT adapter for Claude.
// Selectors are a fallback list, NOT live-verified like muse.ai.
// If none match, the content script returns a named error instead of sending.
window.VoiceAdapter = {
  site: 'claude',
  chatBoxSelectors: ['div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]'],
  sendSelectors: ['button[aria-label="Send Message"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]'],
  assistantSelectors: [],
  userSelectors: []
};
