// AudioWorklet do timbre robótico — roda na thread de áudio (latência ≈ 128 amostras + janela de pitch).
// Etapas por amostra:
//   1. Noise gate com envelope (attack/hold/release) para eliminar ruído de fundo entre falas.
//   2. Pitch shifter granular de dupla leitura em linha de atraso (janelas sin² complementares).
//   3. Modulação em anel (ring modulation) — o "zumbido" metálico característico de vozes robóticas.
//   4. Quantização digital leve (sample-and-hold + redução de bits) para textura sintética.
//   5. Mistura dry/wet controlada pela intensidade.

class RobotVoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' },
      { name: 'ringFreq', defaultValue: 40, minValue: 0, maxValue: 400, automationRate: 'k-rate' },
      { name: 'ringMix', defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'crush', defaultValue: 0.1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gateDb', defaultValue: -52, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.size = 8192;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.win = Math.max(256, Math.round(sampleRate * 0.028)); // janela de ~28 ms
    this.d = 0;
    this.ringPhase = 0;
    this.env = 0;
    this.gain = 0;
    this.hold = 0;
    this.holdCount = 0;
    this.held = 0;
    this.atk = 1 - Math.exp(-1 / (sampleRate * 0.003));
    this.rel = 1 - Math.exp(-1 / (sampleRate * 0.06));
    this.gAtk = 1 - Math.exp(-1 / (sampleRate * 0.004));
    this.gRel = 1 - Math.exp(-1 / (sampleRate * 0.14));
    this.holdSamples = Math.round(sampleRate * 0.18);
  }

  read(delay) {
    let pos = this.w - delay;
    while (pos < 0) pos += this.size;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = this.buf[i % this.size];
    const b = this.buf[(i + 1) % this.size];
    return a + (b - a) * f;
  }

  process(inputs, outputs, p) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const input = inputs[0] && inputs[0][0];
    const n = out[0].length;

    const pitch = p.pitch[0];
    const ringMix = p.ringMix[0];
    const twoPiF = (2 * Math.PI * p.ringFreq[0]) / sampleRate;
    const crush = p.crush[0];
    const gateLin = Math.pow(10, p.gateDb[0] / 20);
    const mix = p.mix[0];
    const W = this.win;
    const rate = 1 - pitch;
    const steps = Math.max(1, Math.round(1 + crush * 4));
    const q = Math.pow(2, 15 - crush * 9);
    const ch = out[0];

    for (let i = 0; i < n; i++) {
      const x = input ? input[i] : 0;

      // 1. noise gate
      const ax = Math.abs(x);
      this.env += (ax > this.env ? this.atk : this.rel) * (ax - this.env);
      if (this.env > gateLin) this.hold = this.holdSamples;
      else if (this.hold > 0) this.hold--;
      const target = this.hold > 0 ? 1 : 0;
      this.gain += (target > this.gain ? this.gAtk : this.gRel) * (target - this.gain);
      const g = x * this.gain;
      this.buf[this.w] = g;

      // 2. pitch shift (duas leituras defasadas em meia janela, crossfade sin²+cos² = 1)
      this.d += rate;
      if (this.d >= W) this.d -= W;
      else if (this.d < 0) this.d += W;
      const d1 = this.d;
      let d2 = d1 + W / 2;
      if (d2 >= W) d2 -= W;
      const w1 = Math.sin((Math.PI * d1) / W);
      const w2 = Math.sin((Math.PI * d2) / W);
      let y = this.read(d1 + 1) * w1 * w1 + this.read(d2 + 1) * w2 * w2;

      // 3. ring modulation
      this.ringPhase += twoPiF;
      if (this.ringPhase > 6.283185307179586) this.ringPhase -= 6.283185307179586;
      y = y * (1 - ringMix) + y * Math.sin(this.ringPhase) * ringMix * 1.6;

      // 4. quantização digital
      if (crush > 0.01) {
        if (++this.holdCount >= steps) {
          this.holdCount = 0;
          this.held = Math.round(y * q) / q;
        }
        y = y * (1 - crush) + this.held * crush;
      }

      // 5. mistura
      ch[i] = g * (1 - mix) + y * mix;
      this.w = (this.w + 1) % this.size;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}

registerProcessor('robot-voice-processor', RobotVoiceProcessor);
