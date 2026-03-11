let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

// Product / comment notification — two descending tones (880 → 660 Hz)
function playTones(ac: AudioContext) {
  const tones = [880, 660];
  tones.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = ac.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}

// Team chat notification — two short ascending "pop" tones (520 → 780 Hz)
// Brighter and punchier than the product sound.
function playChatTones(ac: AudioContext) {
  const tones = [520, 780];
  tones.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = ac.currentTime + i * 0.09;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.22, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

function play(fn: (ac: AudioContext) => void) {
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') {
      ac.resume().then(() => fn(ac)).catch(() => {});
    } else {
      fn(ac);
    }
  } catch {
    // AudioContext unavailable — silently ignore
  }
}

export function playNotificationSound() {
  play(playTones);
}

export function playChatSound() {
  play(playChatTones);
}
