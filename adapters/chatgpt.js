// UNVERIFIED DRAFT adapter for ChatGPT.
// Selectors are a fallback list, NOT live-verified like muse.ai.
// If none match, the content script returns CHATBOX_NOT_FOUND or
// SEND_NOT_FOUND instead of sending. Do not trust this adapter until
// a live probe on ChatGPT confirms the chat box, send button and
// assistant container, in the same way muse.ai was verified.
window.VoiceAdapter = {
  site: 'chatgpt',
  chatBoxSelectors: ['textarea#prompt-textarea', 'textarea[data-id="root"]', 'textarea[placeholder*="Message"]', 'div[contenteditable="true"]'],
  sendSelectors: ['button[data-testid="send-button"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]'],
  assistantSelectors: ['div[data-message-author-role="assistant"]'],
  userSelectors: ['div[data-message-author-role="user"]']
};
