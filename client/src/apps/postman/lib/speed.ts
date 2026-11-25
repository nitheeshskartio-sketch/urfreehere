/** Moving-window throughput estimate (bytes/second) over the last few seconds. */
export class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];

  constructor(private readonly windowMs = 3000) {}

  push(totalBytes: number, t = performance.now()) {
    this.samples.push({ t, bytes: totalBytes });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }

  get bytesPerSecond(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    return dt > 0.25 ? (last.bytes - first.bytes) / dt : 0;
  }

  reset() {
    this.samples = [];
  }
}
