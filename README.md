# Voice AI — Chrome extension

Talk to AI websites by voice, hands-free. No API key for the AI site itself:
you stay signed in to the site in Chrome, the extension puts your spoken
words into that site's own chat box and sends them, and the site gives the
real reply. When the reply is complete, the extension reads it aloud.

Version in this repo: **0.2.2**. Chrome 114 or newer, desktop only.

## How it works

1. Open a supported AI site, signed in, and open the side panel.
   The panel also tries to open on its own when such a site opens; that
   auto-open is best-effort, because Chrome needs a user gesture for it.
   Clicking the extension icon always works.
2. Choose a language first: **Hindi**, **Hinglish**, or **English**.
   The choice is saved.
3. Press the mic and speak.
   - Hindi uses `hi-IN` recognition, so the transcript comes back in
     Devanagari script.
   - Hinglish and English use `en-IN` recognition, so a spoken Hinglish
     sentence comes back in Roman script, not Devanagari.
4. After a 5-second pause, or after pressing Done, the transcript moves to
   review. You get 5 seconds to edit it, press Send now, press Cancel
   (nothing is sent), or press Aur bolo to speak more and append it.
   Editing resets the countdown to 5 seconds. An empty field sends nothing.
   Enter sends now, Escape cancels.
5. The extension fills the site's chat box, fires the input events the
   site needs to enable Send, and clicks Send.
6. It watches the reply until the text is unchanged for 1 second and no
   streaming control is active, or until the 120-second timeout.
   A "Delivery not confirmed" status is treated as an error at once,
   not after the timeout.
7. The full reply is shown in the panel and spoken in sentence chunks.
   Code blocks are shown in full but spoken only as a short note
   ("Isme code hai, panel me dekh lo" in Hindi/Hinglish).
   Stop cancels listening, waiting, and speaking.

Nothing is saved by the extension except five settings in
`chrome.storage.local`: language, voice, rate, volume, pitch, and
auto-open, plus the optional custom-voice fields below. No transcript
or audio is stored.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions`, turn on Developer mode.
3. Click Load unpacked and select the folder that contains
   `manifest.json`.
4. Open a supported site, signed in, and open the panel.

If the mic keeps saying access was denied, allow it for the extension:
`chrome://extensions` > Voice AI > Details > Site settings >
Microphone > Allow, then reload the extension and the site.
The side panel itself does not reliably show a mic prompt, which is
why recognition runs in an offscreen document.

## Supported sites

- **muse.ai — verified live.** Input, Send, reply container, Stop
  control, SPA navigation, and the delivery-error state were checked
  against the live site on 30 October 2026.
- **ChatGPT, Gemini, Claude, Microsoft Copilot, Perplexity, Grok —
  draft adapters, not live-verified.** Their adapters are selector
  fallback lists. If a chat box or Send control is not found, the
  panel shows a named error instead of sending to the wrong element.
  If no reply container is found, it times out instead of speaking
  a wrong reply. Treat these sites as untested until a live check
  confirms each one.

## Settings

In the panel, Settings (top right) offers:

- **Voice**: only voices already installed on your machine and in
  Chrome. During speaking, the panel shows the voice actually used.
  If no Hindi voice exists on the machine, the browser default is
  used and shown.
- **Rate**: 0.5x–2.0x, normal 1.0x.
- **Pitch**: 0.5–2.0, normal 1.0. This changes the tone of the system
  voice; it does not create a new voice.
- **Volume**: 0–100%.
- **Auto-open panel**: on by default.

## Custom voice (ElevenLabs, optional, off by default)

The system voice above cannot clone a voice from a recording.
For one custom voice across Hindi, Hinglish, and English, the
extension can use ElevenLabs text-to-speech instead:

1. In ElevenLabs, clone a voice you own or have permission to clone,
   and copy its Voice ID. No cloned voice is bundled in this repo.
2. Copy your ElevenLabs API key from the ElevenLabs dashboard.
3. In the extension Settings, turn on Custom voice, paste the API
   key and Voice ID there only — never in chat or in this repo —
   and press Test custom voice.
4. When custom voice is on and both fields are set, each cleaned
   reply chunk is sent to ElevenLabs (`eleven_multilingual_v2`)
   and played back in that voice. A failure shows an error instead
   of silently falling back to the system voice. Stop also stops
   custom-voice audio.

Notes: ElevenLabs Instant Voice Cloning save asked for a paid plan
in an October 2026 check, so cloning may not be free. Check
ElevenLabs pricing before paying, and do not expect a cloned voice
to stay available after a subscription ends. When custom voice is
on, reply text is sent to ElevenLabs to make audio.

## Files

- `manifest.json` — Manifest V3, Chrome 114+, permissions
  `sidePanel`, `storage`, `offscreen`, host permissions for the
  sites above plus `api.elevenlabs.io` (custom voice only).
- `sidepanel.html`, `sidepanel.css`, `sidepanel.js` — panel UI,
  state machine, review countdown, speech cleaning and chunking.
- `background.js` — panel opening and message routing only.
- `content.js` — fills the chat box, sends, watches the reply.
- `adapters/muse.js` — the live-verified muse.ai adapter.
- `adapters/chatgpt.js`, `adapters/gemini.js`,
  `adapters/claude.js`, `adapters/copilot.js`,
  `adapters/perplexity.js`, `adapters/grok.js` — draft adapters.
- `offscreen.html`, `offscreen.js` — microphone and speech
  recognition, via Chrome's offscreen USER_MEDIA route.
- `icons/` — extension icons.

No build step, no framework, no server, no database. Plain
HTML, CSS, and JavaScript.

## Known limits

- A reply in a language other than the panel language is a known
  limit: the panel speaks the reply text as written, it does not
  translate or restyle it. If you want a casual Hinglish reply,
  ask the site for one in Hinglish.
- Site layouts change. If a site stops working, its adapter
  selectors need a fresh live check.
- Speech recognition needs internet access through Chrome's
  speech service; it is not fully offline.
