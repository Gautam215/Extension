// Content script: fills the chat box, sends, watches the reply. Holds no history.
// Works with any adapter: muse.ai (live-verified) or a draft adapter that
// only exposes selector lists. Draft adapters return named errors when
// no selector matches, instead of sending to a wrong element.
(function () {
  const adapter = window.VoiceAdapter || window.VoiceMuseAdapter;
  let watching = false;
  let observer = null;
  let checkTimer = null;
  let urlTimer = null;
  let lastUrl = location.href;
  let lastText = '';
  let lastChangeAt = 0;
  let sendTime = 0;

  function reply(message) {
    chrome.runtime.sendMessage(message);
  }

  function firstMatch(selectors) {
    if (!selectors) return null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findChatBox() {
    if (!adapter) return null;
    if (typeof adapter.findChatBox === 'function') return adapter.findChatBox();
    return firstMatch(adapter.chatBoxSelectors);
  }

  function findSend() {
    if (!adapter) return null;
    if (typeof adapter.findSend === 'function') {
      const btn = adapter.findSend();
      return btn && !btn.disabled ? btn : null;
    }
    const btn = firstMatch(adapter.sendSelectors);
    return btn && !btn.disabled ? btn : null;
  }

  function assistantContainers() {
    if (!adapter) return [];
    if (typeof adapter.assistantContainers === 'function') return adapter.assistantContainers();
    if (adapter.assistantSelectors) {
      for (const sel of adapter.assistantSelectors) {
        const list = Array.from(document.querySelectorAll(sel)).filter((el) => el.textContent.trim());
        if (list.length) return list;
      }
    }
    return [];
  }

  function userContainers() {
    if (!adapter) return [];
    if (typeof adapter.userContainers === 'function') return adapter.userContainers();
    if (adapter.userSelectors) {
      for (const sel of adapter.userSelectors) {
        const list = Array.from(document.querySelectorAll(sel));
        if (list.length) return list;
      }
    }
    return [];
  }

  function isStreaming() {
    if (adapter && typeof adapter.isStreaming === 'function') return adapter.isStreaming();
    // Generic fallback for draft adapters: a visible Stop control.
    const stops = Array.from(document.querySelectorAll('button[aria-label*="Stop"], button[data-testid*="stop"]'));
    return stops.some((b) => !b.disabled && b.offsetParent !== null);
  }

  function stopWatching() {
    watching = false;
    if (observer) { observer.disconnect(); observer = null; }
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
  }

  function currentAssistantText() {
    const containers = assistantContainers();
    if (!containers.length) return '';
    return containers[containers.length - 1].textContent.trim();
  }

  function deliveryError() {
    const users = userContainers();
    if (!users.length) return false;
    return users[users.length - 1].textContent.includes('Delivery not confirmed');
  }

  function startWatching() {
    stopWatching();
    watching = true;
    lastText = '';
    lastChangeAt = Date.now();
    sendTime = Date.now();
    observer = new MutationObserver(() => {
      if (!watching) return;
      if (deliveryError()) {
        stopWatching();
        reply({ type: 'ERROR', code: 'DELIVERY_ERROR', message: 'Delivery not confirmed. The message could not be delivered, and there is no retry button for it. Send it again as a new message.' });
        return;
      }
      const text = currentAssistantText();
      if (text && text !== lastText) { lastText = text; lastChangeAt = Date.now(); }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    checkTimer = setInterval(() => {
      if (!watching) return;
      if (deliveryError()) {
        stopWatching();
        reply({ type: 'ERROR', code: 'DELIVERY_ERROR', message: 'Delivery not confirmed. The message could not be delivered, and there is no retry button for it. Send it again as a new message.' });
        return;
      }
      if (Date.now() - sendTime > 120000) {
        stopWatching();
        reply({ type: 'ERROR', code: 'REPLY_TIMEOUT', message: 'No reply arrived in time.' });
        return;
      }
      const text = currentAssistantText();
      if (text && text !== lastText) { lastText = text; lastChangeAt = Date.now(); }
      // Complete only when text is unchanged for 1s AND no active streaming control.
      // Draft adapters with no assistant container never complete here;
      // they time out instead of speaking a wrong or empty reply.
      if (lastText && Date.now() - lastChangeAt >= 1000 && !isStreaming()) {
        const done = lastText;
        stopWatching();
        reply({ type: 'REPLY_COMPLETE', text: done });
      }
    }, 250);
  }

  // SPA navigation: sites change chats without a reload, URL changes.
  urlTimer = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (watching) {
        stopWatching();
        reply({ type: 'WATCH_CANCELLED' });
      }
    }
  }, 500);

  function insertText(box, text) {
    box.focus();
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(box, text);
      } catch (e) {
        box.value = text;
      }
    } else {
      // contenteditable: insert through the selection, then fall back to textContent.
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(box);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        if (!document.execCommand('insertText', false, text)) box.textContent = text;
      } catch (e) {
        box.textContent = text;
      }
    }
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STOP') { stopWatching(); return; }
    if (message.type !== 'SEND_PROMPT') return;
    if (!adapter) {
      reply({ type: 'ERROR', code: 'CHATBOX_NOT_FOUND', message: 'No adapter for this site.' });
      return;
    }
    const box = findChatBox();
    if (!box) {
      reply({ type: 'ERROR', code: 'CHATBOX_NOT_FOUND', message: 'Chat box not found.' });
      return;
    }
    insertText(box, message.text);
    const send = findSend();
    if (!send) {
      reply({ type: 'ERROR', code: 'SEND_NOT_FOUND', message: 'Send control not found.' });
      return;
    }
    send.click();
    reply({ type: 'PROMPT_SENT' });
    startWatching();
  });
})();
