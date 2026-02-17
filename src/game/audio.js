export function createAudioSystem() {
  let audioContext = null;
  let enabled = true;

  function ensureContext() {
    if (!enabled) {
      return null;
    }
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function tone({ frequency = 440, duration = 0.08, type = "sine", gain = 0.06 }) {
    const context = ensureContext();
    if (!context) {
      return;
    }

    const osc = context.createOscillator();
    const amp = context.createGain();

    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.value = gain;

    osc.connect(amp);
    amp.connect(context.destination);

    const now = context.currentTime;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    setEnabled(value) {
      enabled = Boolean(value);
    },
    getEnabled() {
      return enabled;
    },
    click() {
      tone({ frequency: 520, duration: 0.05, type: "triangle", gain: 0.045 });
    },
    launch() {
      tone({ frequency: 330, duration: 0.14, type: "sawtooth", gain: 0.05 });
    },
    impact() {
      tone({ frequency: 120, duration: 0.1, type: "square", gain: 0.06 });
    },
    success() {
      tone({ frequency: 720, duration: 0.12, type: "triangle", gain: 0.05 });
      setTimeout(() => tone({ frequency: 950, duration: 0.14, type: "triangle", gain: 0.04 }), 70);
    },
    fail() {
      tone({ frequency: 180, duration: 0.18, type: "sawtooth", gain: 0.06 });
    },
  };
}
