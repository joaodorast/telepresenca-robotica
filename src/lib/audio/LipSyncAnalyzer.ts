/** Quadro de boca derivado do áudio: abertura, largura (sorriso/“i”), arredondamento (“o”/“u”). */
export interface MouthFrame {
  open: number;
  width: number;
  round: number;
  /** Energia de fala normalizada (0–1). */
  level: number;
}

export const SILENT_MOUTH: MouthFrame = { open: 0, width: 0.5, round: 0, level: 0 };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/**
 * Sincronização labial baseada no áudio efetivamente reproduzido.
 *
 * Em vez de apenas abrir/fechar com o volume, extrai características espectrais:
 *   - energia RMS → abertura da mandíbula;
 *   - centróide espectral (300–5000 Hz) → vogais posteriores (O/U, centróide baixo: boca arredondada)
 *     versus anteriores (E/I, centróide alto: boca alongada); A fica no meio, com maior abertura;
 *   - proporção de energia acima de 4,5 kHz → sibilantes (S, F, X): boca quase fechada e alongada;
 *   - queda brusca de energia → oclusivas/bilabiais (P, B, M): fechamento rápido.
 * Os parâmetros passam por suavização assimétrica (abre rápido, fecha um pouco mais devagar).
 */
export class LipSyncAnalyzer {
  readonly analyser: AnalyserNode;
  private time: Float32Array;
  private freq: Float32Array;
  private state: MouthFrame = { ...SILENT_MOUTH };
  private last = performance.now();
  private prevEnergy = 0;
  /** Último nível calculado (lido pela lógica de atividade sem recomputar). */
  level = 0;

  constructor(ctx: BaseAudioContext, source: AudioNode) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.25;
    source.connect(this.analyser);
    this.time = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
  }

  sample(): MouthFrame {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    this.analyser.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
    const rms = Math.sqrt(sum / this.time.length);
    const db = 20 * Math.log10(rms + 1e-9);
    const level = clamp((db + 54) / 36);
    this.level = level;

    let target: MouthFrame;
    if (level < 0.05) {
      target = SILENT_MOUTH;
    } else {
      this.analyser.getFloatFrequencyData(this.freq);
      const binHz = this.analyser.context.sampleRate / this.analyser.fftSize;
      let num = 0;
      let den = 0;
      let hi = 0;
      let total = 0;
      for (let i = 1; i < this.freq.length; i++) {
        const hz = i * binHz;
        if (hz < 150 || hz > 9000) continue;
        const p = Math.pow(10, this.freq[i] / 10);
        total += p;
        if (hz >= 4500) hi += p;
        if (hz >= 300 && hz <= 5000) {
          num += p * hz;
          den += p;
        }
      }
      const centroid = den > 0 ? num / den : 1000;
      const c = clamp((Math.log(centroid) - Math.log(550)) / (Math.log(2600) - Math.log(550)));
      const sib = total > 0 ? clamp((hi / total) * 3) : 0;
      const drop = this.prevEnergy - level > 0.18 ? 0.5 : 0; // oclusiva
      const amp = Math.pow(level, 0.75);
      target = {
        open: clamp(amp * (1.05 - 0.45 * c) * (1 - 0.75 * sib) * (1 - drop)),
        width: clamp(0.32 + 0.6 * c + 0.25 * sib - 0.2 * clamp(1 - c * 2.2)),
        round: clamp((1 - c * 2.4) * 1.1 * (1 - sib)) * Math.min(1, level * 2.5),
        level,
      };
    }
    this.prevEnergy = level;

    const s = this.state;
    const k = (to: number, from: number) => {
      const tau = to > from ? 0.035 : 0.085;
      return from + (to - from) * (1 - Math.exp(-dt / tau));
    };
    s.open = k(target.open, s.open);
    s.width = k(target.width, s.width);
    s.round = k(target.round, s.round);
    s.level = k(target.level, s.level);
    return s;
  }

  dispose() {
    this.analyser.disconnect();
  }
}
