/**
 * Microphone capture and voice activity detection (Web Audio API).
 */

/** Speaking detection tuning. Levels are in dBFS (0 = loudest). */
export const VAD = {
  /** Louder than this counts as voice. */
  thresholdDb: -50,
  /** Must stay above the threshold this long before "speaking" starts (ignores clicks). */
  attackMs: 90,
  /** Keeps "speaking" through short pauses between words to avoid flicker. */
  releaseMs: 500,
  /** How often levels are sampled. */
  intervalMs: 50,
};

export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

let ctx: AudioContext | null = null;

/** Shared audio context; resumed on use (browsers start it suspended until a user gesture). */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function micSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

export async function getMicStream(deviceId?: string): Promise<MediaStream> {
  if (!micSupported()) {
    const err = new Error('Microphone access needs a secure (HTTPS) page.');
    err.name = 'InsecureContext';
    throw err;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { ...MIC_CONSTRAINTS, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
    video: false,
  });
}

/** Friendly explanation for a getUserMedia failure. */
export function micErrorMessage(err: unknown): string {
  const name = (err as DOMException)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was blocked. Click the icon next to the address bar, allow the microphone for this site, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one, or choose another in Settings.';
    case 'NotReadableError':
      return 'Your microphone is being used by another app. Close it and try again.';
    case 'InsecureContext':
      return 'Microphone access needs a secure (HTTPS) page. You can still listen.';
    default:
      return "The microphone couldn't be started.";
  }
}

/** Measures the loudness of a stream. Not connected to the speakers. */
export class LevelMeter {
  private source: MediaStreamAudioSourceNode;
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;

  constructor(stream: MediaStream) {
    const c = audioContext();
    this.source = c.createMediaStreamSource(stream);
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
  }

  /** Current RMS level in dBFS. */
  db(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    return 20 * Math.log10(rms || 1e-8);
  }

  dispose() {
    try {
      this.source.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

/** Turns a stream of levels into a stable speaking / not speaking signal. */
export class SpeakingDetector {
  speaking = false;
  private aboveSince = 0;
  private lastAbove = 0;

  update(db: number, now: number): boolean {
    if (db > VAD.thresholdDb) {
      if (!this.aboveSince) this.aboveSince = now;
      this.lastAbove = now;
      if (!this.speaking && now - this.aboveSince >= VAD.attackMs) this.speaking = true;
    } else {
      this.aboveSince = 0;
      if (this.speaking && now - this.lastAbove > VAD.releaseMs) this.speaking = false;
    }
    return this.speaking;
  }

  reset() {
    this.speaking = false;
    this.aboveSince = 0;
  }
}

export async function listDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return { inputs: all.filter((d) => d.kind === 'audioinput'), outputs: all.filter((d) => d.kind === 'audiooutput') };
}

export const canChooseOutput = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
