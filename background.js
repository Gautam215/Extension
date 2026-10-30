// Service worker: panel opening and message routing only. Holds no transcript.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true });
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

const SUPPORTED_HOSTS = ['muse.ai', 'chatgpt.com', 'chat.openai.com', 'gemini.google.com', 'claude.ai', 'copilot.microsoft.com', 'perplexity.ai', 'www.perplexity.ai', 'grok.com'];
function isSupportedSite(url) {
  try { return SUPPORTED_HOSTS.includes(new URL(url).hostname); } catch (e) { return false; }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || !isSupportedSite(tab.url)) return;
  chrome.storage.local.get({ autoOpen: true }, (stored) => {
    if (!stored.autoOpen) return;
    // Best-effort only: Chrome may ignore this without a user gesture. No retry loop.
    chrome.sidePanel.open({ tabId: tabId }).catch(() => {});
  });
});

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Microphone access for voice input in the side panel.'
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message._relay) return;
  if (message && message.type === 'CUSTOM_TTS') {
    (async () => {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(message.voiceId), {
          method: 'POST',
          headers: { 'xi-api-key': message.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message.text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
        });
        if (!res.ok) {
          chrome.runtime.sendMessage({ _relay: true, type: 'CUSTOM_TTS_ERROR', index: message.index, test: !!message.test, message: 'ElevenLabs returned status ' + res.status + '. Check key, Voice ID and balance.' });
          return;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        let binary = '';
        for (let i = 0; i < buf.length; i += 8192) binary += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
        chrome.runtime.sendMessage({ _relay: true, type: 'CUSTOM_TTS_RESULT', index: message.index, test: !!message.test, audio: 'data:audio/mpeg;base64,' + btoa(binary) });
      } catch (e) {
        chrome.runtime.sendMessage({ _relay: true, type: 'CUSTOM_TTS_ERROR', index: message.index, test: !!message.test, message: 'Could not reach ElevenLabs. Check internet and key.' });
      }
    })();
    return;
  }
  if (message && message.type === 'OFFSCREEN_LISTEN') {
    ensureOffscreen().then(() => {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_START', lang: message.lang });
    }).catch(() => {
      chrome.runtime.sendMessage({ _relay: true, type: 'ERROR', code: 'MIC_DENIED', message: 'Microphone access was denied.' });
    });
    return;
  }
  if (message && message.type === 'OFFSCREEN_STOP') {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
    return;
  }
  if (!message || (message.type !== 'SEND_PROMPT' && message.type !== 'STOP')) {
    // Messages from the content script and offscreen document: forward them to the panel.
    if (message && (message.type === 'PROMPT_SENT' || message.type === 'REPLY_COMPLETE' || message.type === 'ERROR' || message.type === 'WATCH_CANCELLED' || message.type === 'OFFSCREEN_RESULT' || message.type === 'OFFSCREEN_END' || message.type === 'OFFSCREEN_ERROR')) {
      chrome.runtime.sendMessage(Object.assign({}, message, { _relay: true }));
    }
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      chrome.runtime.sendMessage({ _relay: true, type: 'ERROR', code: 'CHATBOX_NOT_FOUND', message: 'No active tab found.' });
      return;
    }
    chrome.tabs.sendMessage(tab.id, message, () => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({ _relay: true, type: 'ERROR', code: 'CHATBOX_NOT_FOUND', message: 'The panel could not reach the AI tab. Open a supported AI site and try again.' });
      }
    });
  });
});
