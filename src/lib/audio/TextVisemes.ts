import type { MouthFrame } from './LipSyncAnalyzer';

/**
 * Visemas a partir do texto — usado apenas quando a saudação é falada pela síntese de voz do navegador
 * (cujo áudio não pode ser analisado pela Web Audio API). A linha do tempo é estimada e
 * ressincronizada a cada evento `boundary` (início de palavra) quando o navegador os emite.
 */
interface Seg {
  start: number;
  dur: number;
  char: number;
  open: number;
  width: number;
  round: number;
}

const V: Record<string, [number, number, number]> = {
  a: [0.85, 0.55, 0],
  e: [0.5, 0.78, 0],
  i: [0.28, 0.95, 0],
  o: [0.6, 0.3, 0.8],
  u: [0.32, 0.2, 1],
};
const CLOSED = new Set(['m', 'b', 'p']);
const DENTAL = new Set(['f', 'v']);
const SIB = new Set(['s', 'z', 'x', 'c', 'j', 'g']);

export class TextVisemePlayer {
  private segs: Seg[] = [];
  private t0 = 0;
  private total = 0;
  private active = false;

  start(text: string, rate = 1) {
    const norm = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const segs: Seg[] = [];
    let t = 0;
    const k = 1 / Math.max(0.5, rate);
    for (let i = 0; i < norm.length; i++) {
      const ch = norm[i];
      let dur = 0.065 * k;
      let f: [number, number, number] = [0.22, 0.55, 0];
      if (V[ch]) {
        f = V[ch];
        dur = 0.1 * k;
      } else if (CLOSED.has(ch)) f = [0, 0.5, 0.1];
      else if (DENTAL.has(ch)) f = [0.08, 0.6, 0];
      else if (SIB.has(ch)) f = [0.12, 0.8, 0];
      else if (ch === ' ') {
        f = [0.05, 0.5, 0];
        dur = 0.05 * k;
      } else if (/[.,!?;:]/.test(ch)) {
        f = [0, 0.5, 0];
        dur = 0.22 * k;
      } else if (!/[a-z]/.test(ch)) continue;
      segs.push({ start: t, dur, char: i, open: f[0], width: f[1], round: f[2] });
      t += dur;
    }
    this.segs = segs;
    this.total = t;
    this.t0 = performance.now();
    this.active = true;
  }

  /** Reposiciona a linha do tempo no caractere indicado pelo evento boundary. */
  syncTo(charIndex: number) {
    const seg = this.segs.find((s) => s.char >= charIndex);
    if (seg) this.t0 = performance.now() - seg.start * 1000;
  }

  stop() {
    this.active = false;
  }

  isActive() {
    return this.active;
  }

  get estimatedDuration() {
    return this.total;
  }

  sample(): MouthFrame | null {
    if (!this.active) return null;
    const t = (performance.now() - this.t0) / 1000;
    if (t >= this.total) return { open: 0, width: 0.5, round: 0, level: 0.1 };
    let i = this.segs.findIndex((s) => t < s.start + s.dur);
    if (i < 0) i = this.segs.length - 1;
    const a = this.segs[i];
    const b = this.segs[Math.min(i + 1, this.segs.length - 1)];
    const u = Math.min(1, Math.max(0, (t - a.start) / a.dur));
    const e = u * u * (3 - 2 * u) * 0.5; // mistura suave com o próximo visema
    return {
      open: a.open + (b.open - a.open) * e,
      width: a.width + (b.width - a.width) * e,
      round: a.round + (b.round - a.round) * e,
      level: 0.55,
    };
  }
}
