// Offscreen document: the only place SpeechRecognition runs.
// Chrome does not reliably show a mic prompt in the side panel itself,
// which is why panel-only recognition kept returning not-allowed.
// The offscreen document exists for USER_MEDIA, Chrome's official mic route.
let recognition = null;
let listening = false;
let manualStop = false;

function send(message) {
  chrome.runtime.sendMessage(message);
}

async function start(lang) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { send({ type: 'OFFSCREEN_ERROR', error: 'not-supported' }); return; }
  // Trigger the mic permission prompt for the extension origin first.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    send({ type: 'OFFSCREEN_ERROR', error: 'not-allowed' });
    return;
  }
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  recognition = new SR();
  recognition.lang = lang || 'en-IN';
  recognition.interimResults = true;
  recognition.continuous = true;
  listening = true; manualStop = false;
  recognition.onresult = (event) => {
    let finalPart = ''; let interimPart = '';
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalPart += r[0].transcript; else interimPart += r[0].transcript;
    }
    send({ type: 'OFFSCREEN_RESULT', final: finalPart, interim: interimPart });
  };
  recognition.onerror = (event) => {
    send({ type: 'OFFSCREEN_ERROR', error: event.error || 'unknown' });
  };
  recognition.onend = () => {
    if (!listening || manualStop) return;
    send({ type: 'OFFSCREEN_END' });
  };
  try { recognition.start(); } catch (e) {
    send({ type: 'OFFSCREEN_ERROR', error: 'start-failed' });
  }
}

function stop() {
  manualStop = true; listening = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} recognition = null; }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OFFSCREEN_START') start(message.lang);
  if (message.type === 'OFFSCREEN_STOP') stop();
});
