// Side panel: one state at a time. No transcript or audio is saved.
let state = 'idle';
let settings = { language: 'en', voice: '', rate: 1, volume: 1, pitch: 1, autoOpen: true, customVoice: false, elevenApiKey: '', elevenVoiceId: '' };
let customAudio = null;
let customTestAudio = null;
let lastReplyText = '';
let lastReplyAt = 0;
let recognition = null;
let listening = false;
let manualStop = false;
let finalTranscript = '';
let interimTranscript = '';
let baseTranscript = '';
let lastSpeechAt = 0;
let pauseTimer = null;
let reviewTimer = null;
let reviewSeconds = 5;
let speechQueue = [];
let speechIndex = 0;
let speaking = false;

const $ = (id) => document.getElementById(id);

function codeNote(lang) {
  // Hinglish and Hindi both get the Roman Hinglish note, English gets English.
  return lang === 'en' ? 'There is a code block, you can see it in the panel' : 'Isme code hai, panel me dekh lo';
}

// Pure speech cleaning: panel text stays full, only the spoken copy is cleaned.
function cleanForSpeech(text, lang) {
  let out = String(text || '');
  out = out.replace(/```[\s\S]*?```/g, ' ' + codeNote(lang) + ' ');
  out = out.replace(/`([^`]*)`/g, '$1');
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
  out = out.replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1$2');
  out = out.replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '');
  out = out.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, '');
  out = out.replace(/\|/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function chunkText(text) {
  const parts = String(text || '').split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  for (const part of parts) {
    if (part.length <= 200) { chunks.push(part); continue; }
    part.split(/[,;]\s+/).forEach((p) => { if (p.trim()) chunks.push(p.trim()); });
  }
  return chunks.length ? chunks : [text].filter(Boolean);
}

function setState(next, label) {
  state = next;
  $('stateBanner').textContent = label || next;
  $('micButton').disabled = !(next === 'idle');
  $('micButton').classList.toggle('recording', next === 'listening');
  $('micButton').setAttribute('aria-label', next === 'listening' ? 'Stop listening' : 'Start listening');
  $('doneButton').classList.toggle('hidden', next !== 'listening');
  $('stopButton').classList.toggle('hidden', !(next === 'waiting' || next === 'speaking'));
  $('hintSection').classList.toggle('hidden', next !== 'idle' && next !== 'error');
  $('transcriptSection').classList.toggle('hidden', !(next === 'listening' || next === 'sending' || next === 'waiting'));
  $('reviewSection').classList.toggle('hidden', next !== 'reviewing');
  $('replySection').classList.toggle('hidden', next !== 'speaking');
  $('errorSection').classList.toggle('hidden', next !== 'error');
  $('langHindi').disabled = next === 'listening' || next === 'reviewing';
  $('langHinglish').disabled = next === 'listening' || next === 'reviewing';
  $('langEnglish').disabled = next === 'listening' || next === 'reviewing';
}

function showError(code, message, hint) {
  stopSpeech();
  stopListening(true);
  $('errorText').textContent = message || code;
  $('errorHint').textContent = hint || '';
  setState('error', 'Error');
}

function backToIdle() {
  stopSpeech();
  stopListening(true);
  finalTranscript = ''; interimTranscript = ''; baseTranscript = '';
  $('transcriptText').textContent = '';
  $('replyText').textContent = '';
  setState('idle', 'Idle');
}

function saveSettings() {
  chrome.storage.local.set(settings);
}

function applyLanguage() {
  $('langHindi').classList.toggle('selected', settings.language === 'hi');
  $('langHindi').setAttribute('aria-pressed', settings.language === 'hi' ? 'true' : 'false');
  $('langHinglish').classList.toggle('selected', settings.language === 'hinglish');
  $('langHinglish').setAttribute('aria-pressed', settings.language === 'hinglish' ? 'true' : 'false');
  $('langEnglish').classList.toggle('selected', settings.language === 'en');
  $('langEnglish').setAttribute('aria-pressed', settings.language === 'en' ? 'true' : 'false');
}

function recognitionLang() {
  // Hindi mode uses hi-IN, which returns Devanagari script.
  // Hinglish mode uses en-IN, which returns Roman script, so a spoken
  // Hinglish sentence goes to the site as Roman Hinglish, not Devanagari.
  // English mode also uses en-IN.
  return settings.language === 'hi' ? 'hi-IN' : 'en-IN';
}

function startListening() {
  // Recognition runs in the offscreen document, not in the panel.
  // Chrome does not reliably show a mic prompt in the side panel itself,
  // which is why panel-only recognition kept returning not-allowed.
  listening = true; manualStop = false;
  finalTranscript = ''; interimTranscript = ''; lastSpeechAt = Date.now();
  $('transcriptText').textContent = baseTranscript ? baseTranscript : '';
  setState('listening', 'Listening');
  pauseTimer = setInterval(() => {
    if (!listening) return;
    const current = (baseTranscript ? baseTranscript + ' ' : '') + finalTranscript + interimTranscript;
    if (current.trim() && Date.now() - lastSpeechAt >= 5000) finishListening();
  }, 500);
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_LISTEN', lang: recognitionLang() });
}

function stopListening(manual) {
  manualStop = !!manual;
  listening = false;
  if (pauseTimer) { clearInterval(pauseTimer); pauseTimer = null; }
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
}

function finishListening() {
  const current = ((baseTranscript ? baseTranscript + ' ' : '') + finalTranscript + interimTranscript).trim();
  stopListening(true);
  baseTranscript = '';
  if (!current) { backToIdle(); return; }
  $('reviewField').value = current;
  startReview();
}

function startReview() {
  reviewSeconds = 5;
  $('countdownText').textContent = '5 seconds left to send';
  setState('reviewing', 'Review');
  if (reviewTimer) clearInterval(reviewTimer);
  reviewTimer = setInterval(() => {
    reviewSeconds -= 1;
    if (reviewSeconds <= 0) { clearInterval(reviewTimer); reviewTimer = null; sendReview(); return; }
    $('countdownText').textContent = reviewSeconds + ' seconds left to send';
  }, 1000);
}

function cancelReview() {
  if (reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
  backToIdle();
}

function sendReview() {
  if (reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
  const text = $('reviewField').value.trim();
  if (!text) { backToIdle(); return; }
  setState('sending', 'Sending');
  $('transcriptText').textContent = text;
  chrome.runtime.sendMessage({ type: 'SEND_PROMPT', text: text, site: 'muse' });
}

function stopSpeech() {
  speaking = false; speechQueue = []; speechIndex = 0;
  if (customAudio) { customAudio.pause(); customAudio = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function customVoiceReady() {
  return !!(settings.customVoice && settings.elevenApiKey && settings.elevenVoiceId);
}

function requestCustomChunk(index, text, test) {
  chrome.runtime.sendMessage({ type: 'CUSTOM_TTS', index: index, text: text, test: !!test, apiKey: settings.elevenApiKey, voiceId: settings.elevenVoiceId });
}

function speakReply(text) {
  // Duplicate guard: REPLY_COMPLETE can arrive twice (original + background
  // relay). Without this, the first chunk is queued twice in speechSynthesis
  // and the starting line is heard twice, while the rest plays once.
  if (text && text === lastReplyText && Date.now() - lastReplyAt < 10000) return;
  lastReplyText = text; lastReplyAt = Date.now();
  stopSpeech();
  const cleaned = cleanForSpeech(text, settings.language);
  speechQueue = chunkText(cleaned);
  speechIndex = 0;
  if (!speechQueue.length) { backToIdle(); return; }
  speaking = true;
  setState('speaking', 'Speaking');
  $('replyText').textContent = text;
  if (customVoiceReady()) { requestCustomChunk(0, speechQueue[0], false); return; }
  speakNext();
}

function speakNext() {
  if (!speaking || speechIndex >= speechQueue.length) { speaking = false; backToIdle(); return; }
  const voices = window.speechSynthesis.getVoices();
  let voice = null;
  if (settings.voice) voice = voices.find((v) => v.name === settings.voice) || null;
  if (!voice && settings.language === 'hi') voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('hi')) || null;
  if (!voice && settings.language !== 'hi') voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) || null;
  if (!voice) voice = voices[0] || null;
  $('voiceNameText').textContent = voice ? 'Voice in use: ' + voice.name : 'Voice in use: browser default';
  const utter = new SpeechSynthesisUtterance(speechQueue[speechIndex]);
  if (voice) utter.voice = voice;
  utter.lang = recognitionLang();
  utter.rate = settings.rate; utter.volume = settings.volume; utter.pitch = settings.pitch || 1;
  utter.onend = () => { speechIndex += 1; speakNext(); };
  utter.onerror = () => { speaking = false; backToIdle(); };
  window.speechSynthesis.speak(utter);
}

function loadVoices() {
  const voices = window.speechSynthesis.getVoices();
  const select = $('voiceSelect');
  select.innerHTML = '';
  const def = document.createElement('option');
  def.value = ''; def.textContent = 'Browser default';
  select.appendChild(def);
  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.name; opt.textContent = v.name + ' (' + v.lang + ')';
    select.appendChild(opt);
  });
  select.value = settings.voice || '';
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(settings, (stored) => {
    settings = Object.assign(settings, stored);
    applyLanguage();
    $('rateSlider').value = settings.rate; $('rateValue').textContent = settings.rate.toFixed(1) + 'x';
    $('pitchSlider').value = settings.pitch || 1; $('pitchValue').textContent = (settings.pitch || 1).toFixed(1);
    $('customVoiceToggle').checked = !!settings.customVoice;
    $('elevenApiKey').value = settings.elevenApiKey || '';
    $('elevenVoiceId').value = settings.elevenVoiceId || '';
    $('volumeSlider').value = settings.volume; $('volumeValue').textContent = Math.round(settings.volume * 100) + '%';
    $('autoOpenToggle').checked = !!settings.autoOpen;
    loadVoices();
  });
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }
  $('micButton').addEventListener('click', () => {
    if (state === 'listening') { finishListening(); return; }
    if (state === 'idle') { baseTranscript = ''; startListening(); }
  });
  $('doneButton').addEventListener('click', finishListening);
  $('stopButton').addEventListener('click', () => {
    stopSpeech();
    chrome.runtime.sendMessage({ type: 'STOP' });
    backToIdle();
  });
  $('sendNowButton').addEventListener('click', sendReview);
  $('cancelButton').addEventListener('click', cancelReview);
  $('aurBoloButton').addEventListener('click', () => {
    if (reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
    baseTranscript = $('reviewField').value.trim();
    startListening();
  });
  $('reviewField').addEventListener('input', () => {
    reviewSeconds = 5;
    $('countdownText').textContent = '5 seconds left to send';
    $('sendNowButton').disabled = !$('reviewField').value.trim();
  });
  $('reviewField').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendReview(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelReview(); }
  });
  $('langHindi').addEventListener('click', () => { settings.language = 'hi'; applyLanguage(); saveSettings(); });
  $('langHinglish').addEventListener('click', () => { settings.language = 'hinglish'; applyLanguage(); saveSettings(); });
  $('langEnglish').addEventListener('click', () => { settings.language = 'en'; applyLanguage(); saveSettings(); });
  $('settingsButton').addEventListener('click', () => {
    $('mainView').classList.add('hidden'); $('settingsView').classList.remove('hidden');
    document.querySelector('.controls').classList.add('hidden');
  });
  $('backButton').addEventListener('click', () => {
    $('settingsView').classList.add('hidden'); $('mainView').classList.remove('hidden');
    document.querySelector('.controls').classList.remove('hidden');
  });
  $('errorBackButton').addEventListener('click', backToIdle);
  $('voiceSelect').addEventListener('change', () => { settings.voice = $('voiceSelect').value; saveSettings(); loadVoices(); });
  $('rateSlider').addEventListener('input', () => { settings.rate = parseFloat($('rateSlider').value); $('rateValue').textContent = settings.rate.toFixed(1) + 'x'; saveSettings(); });
  $('pitchSlider').addEventListener('input', () => { settings.pitch = parseFloat($('pitchSlider').value); $('pitchValue').textContent = settings.pitch.toFixed(1); saveSettings(); });
  $('customVoiceToggle').addEventListener('change', () => { settings.customVoice = $('customVoiceToggle').checked; saveSettings(); });
  $('elevenApiKey').addEventListener('change', () => { settings.elevenApiKey = $('elevenApiKey').value.trim(); saveSettings(); });
  $('elevenVoiceId').addEventListener('change', () => { settings.elevenVoiceId = $('elevenVoiceId').value.trim(); saveSettings(); });
  $('testCustomVoiceButton').addEventListener('click', () => {
    if (!customVoiceReady()) { $('voiceNameText').textContent = 'Custom voice test needs the toggle on, plus API key and Voice ID.'; return; }
    $('voiceNameText').textContent = 'Custom voice test: generating audio...';
    requestCustomChunk(0, 'Namaste, ye custom voice ka test hai', true);
  });
  $('volumeSlider').addEventListener('input', () => { settings.volume = parseFloat($('volumeSlider').value); $('volumeValue').textContent = Math.round(settings.volume * 100) + '%'; saveSettings(); });
  $('autoOpenToggle').addEventListener('change', () => { settings.autoOpen = $('autoOpenToggle').checked; saveSettings(); });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'OFFSCREEN_RESULT' && state === 'listening') {
      lastSpeechAt = Date.now();
      finalTranscript = message.final || ''; interimTranscript = message.interim || '';
      $('transcriptText').textContent = ((baseTranscript ? baseTranscript + ' ' : '') + finalTranscript + interimTranscript).trim();
    }
    if (message.type === 'OFFSCREEN_END' && state === 'listening') {
      const current = ((baseTranscript ? baseTranscript + ' ' : '') + finalTranscript + interimTranscript).trim();
      if (current) finishListening(); else backToIdle();
    }
    if (message.type === 'OFFSCREEN_ERROR' && state === 'listening') {
      if (message.error === 'not-allowed' || message.error === 'service-not-allowed') {
        showError('MIC_DENIED', 'Microphone access was denied.', 'Allow microphone for this extension: chrome://extensions > Voice AI > Details > Site settings > Microphone > Allow, then press the mic again.');
      } else {
        showError('MIC_DENIED', 'Could not start listening.', 'Press the mic again.');
      }
    }
    if (message.type === 'CUSTOM_TTS_RESULT') {
      if (message.test) {
        if (customTestAudio) customTestAudio.pause();
        customTestAudio = new Audio(message.audio);
        customTestAudio.volume = settings.volume;
        customTestAudio.onended = () => { $('voiceNameText').textContent = 'Custom voice test done.'; };
        customTestAudio.play().catch(() => { $('voiceNameText').textContent = 'Custom voice test could not play.'; });
        return;
      }
      if (!speaking || message.index !== speechIndex) return;
      if (customAudio) customAudio.pause();
      customAudio = new Audio(message.audio);
      customAudio.volume = settings.volume;
      $('voiceNameText').textContent = 'Voice in use: custom voice';
      customAudio.onended = () => {
        speechIndex += 1;
        if (!speaking) return;
        if (speechIndex >= speechQueue.length) { speaking = false; backToIdle(); return; }
        requestCustomChunk(speechIndex, speechQueue[speechIndex], false);
      };
      customAudio.play().catch(() => { speaking = false; backToIdle(); });
      return;
    }
    if (message.type === 'CUSTOM_TTS_ERROR') {
      if (message.test) { $('voiceNameText').textContent = 'Custom voice test failed: ' + (message.message || 'check key and Voice ID.'); return; }
      showError('CUSTOM_VOICE_ERROR', message.message || 'Custom voice failed.', 'Check the API key and Voice ID in Settings, or turn Custom voice off to use the system voice.');
      return;
    }
    if (message.type === 'PROMPT_SENT') setState('waiting', 'Waiting for reply');
    if (message.type === 'REPLY_COMPLETE') speakReply(message.text || '');
    if (message.type === 'WATCH_CANCELLED') { stopSpeech(); backToIdle(); }
    if (message.type === 'ERROR') {
      const hints = {
        NOT_LOGGED_IN: 'Sign in to the AI site in the browser first, then try again.',
        MIC_DENIED: 'Allow microphone access in the browser, then try again.',
        CHATBOX_NOT_FOUND: 'The panel could not find the chat box on this page. Reload the AI site and try again. On a new site this can mean its adapter is not verified yet.',
        SEND_NOT_FOUND: 'The panel could not find the send control after filling the chat box. Reload the AI site and try again.',
        REPLY_TIMEOUT: 'No reply arrived in time. Try again with a new message.'
      };
      showError(message.code || 'ERROR', message.message || 'Something went wrong.', hints[message.code] || '');
    }
  });
  window.addEventListener('beforeunload', () => { stopSpeech(); stopListening(true); });
});
