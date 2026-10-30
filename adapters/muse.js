// muse.ai adapter: verified selectors from live inspection, 30 Oct 2026.
// Chat box: textarea[aria-label="Message"]. Send: button[aria-label="Send"],
// absent while empty, present and enabled only after text is inserted.
// Assistant reply: div[class*="group/msg"] containing button[aria-label="React"],
// user message in the same container starts with "You:" and has Copy, not React.
window.VoiceAdapter = window.VoiceMuseAdapter = {
  site: 'muse',
  findChatBox: function () {
    return document.querySelector('textarea[aria-label="Message"]');
  },
  findSend: function () {
    const btn = document.querySelector('button[aria-label="Send"]');
    return btn && !btn.disabled ? btn : null;
  },
  assistantContainers: function () {
    const all = Array.from(document.querySelectorAll('div[class*="group/msg"]'));
    return all.filter((el) => el.querySelector('button[aria-label="React"]') && !el.textContent.trim().startsWith('You:'));
  },
  userContainers: function () {
    const all = Array.from(document.querySelectorAll('div[class*="group/msg"]'));
    return all.filter((el) => el.textContent.trim().startsWith('You:'));
  },
  isStreaming: function () {
    const stop = document.querySelector('button[data-testid="hatch-composer-stop-button"]');
    if (!stop) return false;
    const wrap = stop.closest('div[data-hatch-composer-action="stop"]');
    if (!wrap) return true;
    const style = window.getComputedStyle(wrap);
    if (style.opacity !== '1') return false;
    if (wrap.hasAttribute('inert')) return false;
    if (wrap.hasAttribute('aria-hidden')) return false;
    return true;
  }
};
