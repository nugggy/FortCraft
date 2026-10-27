// Voiced radio lines using the browser's speech synthesis. Echo is bright and quick,
// the Architect is low and slow. Silently does nothing where speech isn't available.

const PREFS = {
  echo: { names: /(en-AU|Karen|Catherine|Natasha|Libby|Sonia|Hazel|Zira|Aria|Jenny|Samantha|Female)/i, pitch: 1.35, rate: 1.08, volume: 0.95 },
  architect: { names: /(George|Ryan|Guy|David|Mark|Daniel|James|William|Thomas|Male)/i, pitch: 0.15, rate: 0.82, volume: 0.9 },
};

export function installVoice(game) {
  const voice = { speak() {}, cancel() {}, available: false };
  game.voice = voice;
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return voice;
  voice.available = true;

  let voices = [];
  const load = () => { try { voices = synth.getVoices() || []; } catch { voices = []; } };
  load();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', load);

  const pick = (who) => {
    const en = voices.filter(v => /^en/i.test(v.lang));
    const pref = PREFS[who] || PREFS.echo;
    return en.find(v => pref.names.test(v.name) || pref.names.test(v.lang)) || en[who === 'architect' ? en.length - 1 : 0] || null;
  };
  // Speech engines read capitals letter by letter and stumble on quotes.
  const clean = (t) => t.replace(/["“”]/g, '').replace(/\b([A-Z]{2,})\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());

  voice.speak = (who, text) => {
    if (game.settings.voice === false || !game.audio.ctx) return;
    try {
      const u = new SpeechSynthesisUtterance(clean(text));
      const pref = PREFS[who] || PREFS.echo;
      const v = pick(who);
      if (v) u.voice = v;
      u.pitch = pref.pitch; u.rate = pref.rate;
      u.volume = pref.volume * Math.min(1, (game.settings.volume ?? 0.6) * 1.5);
      u.onstart = () => game.music?.duck(true);
      u.onend = u.onerror = () => { if (!synth.speaking) game.music?.duck(false); };
      synth.speak(u);
    } catch { /* speech unavailable */ }
  };
  voice.cancel = () => { try { synth.cancel(); } catch { /* ignore */ } game.music?.duck(false); };

  game.addSystem({ reset() { voice.cancel(); } });
  return voice;
}
