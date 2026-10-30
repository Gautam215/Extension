// UNVERIFIED DRAFT adapter for Microsoft Copilot (copilot.microsoft.com).
// Selectors are a fallback list, NOT live-verified like muse.ai.
// If none match, the content script returns a named error instead of sending.
window.VoiceAdapter = {
  site: 'copilot',
  chatBoxSelectors: ['textarea', 'div[contenteditable="true"]'],
  sendSelectors: ['button[aria-label="Submit"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]'],
  assistantSelectors: [],
  userSelectors: []
};
