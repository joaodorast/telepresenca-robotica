/** Nível RMS de um AnalyserNode mapeado para 0–1 (faixa útil de −60 dBFS a −12 dBFS). */
export function rmsLevel(analyser: AnalyserNode, buf: Float32Array): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  const db = 20 * Math.log10(rms + 1e-9);
  return Math.min(1, Math.max(0, (db + 60) / 48));
}

export class LevelMeter {
  private buf: Float32Array;
  constructor(readonly analyser: AnalyserNode) {
    this.buf = new Float32Array(analyser.fftSize);
  }
  get level() {
    return rmsLevel(this.analyser, this.buf);
  }
}

export function createAnalyser(ctx: BaseAudioContext, fftSize = 1024) {
  const a = ctx.createAnalyser();
  a.fftSize = fftSize;
  a.smoothingTimeConstant = 0.2;
  return a;
}
