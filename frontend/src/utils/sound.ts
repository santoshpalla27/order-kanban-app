let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

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

export function playNotificationSound() {
  try {
    const ac = getCtx();
    // Resume context if browser suspended it (required by autoplay policy)
    if (ac.state === 'suspended') {
      ac.resume().then(() => playTones(ac)).catch(() => {});
    } else {
      playTones(ac);
    }
  } catch {
    // AudioContext unavailable — silently ignore
  }
}
