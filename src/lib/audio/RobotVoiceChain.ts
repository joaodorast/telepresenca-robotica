import type { VoiceSettings } from './voicePresets';
import { createAnalyser, LevelMeter } from './levels';

const WORKLET_URL = `${import.meta.env.BASE_URL}worklets/robot-voice-processor.js`;
const FORMANT_BASE = [520, 1380, 2750];

/**
 * Cadeia de processamento da voz do operador:
 *
 *  mic → ganho de entrada → passa-altas 90 Hz → [AudioWorklet: gate · pitch · ring-mod · crush]
 *      → 3 ressonâncias de formante (peaking) → ┬→ soma → passa-baixas → compressor → ganho de saída → WebRTC
 *                                               └→ comb metálico (atraso + realimentação) ┘
 *
 * A saída é um MediaStreamTrack enviado ao robô. Um ramo opcional de retorno (monitor)
 * permite ao operador ouvir a própria voz processada em fones de ouvido.
 */
export class RobotVoiceChain {
  readonly ctx: AudioContext;
  private source: MediaStreamAudioSourceNode | null = null;
  private readonly inGain: GainNode;
  private readonly highpass: BiquadFilterNode;
  private readonly worklet: AudioWorkletNode;
  private readonly formants: BiquadFilterNode[];
  private readonly comb: DelayNode;
  private readonly combFeedback: GainNode;
  private readonly combWet: GainNode;
  private readonly sum: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly outGain: GainNode;
  private readonly monitorGain: GainNode;
  private readonly dest: MediaStreamAudioDestinationNode;
  private readonly recordDest: MediaStreamAudioDestinationNode;
  readonly output: AudioNode;
  readonly inputMeter: LevelMeter;
  readonly outputMeter: LevelMeter;

  private constructor(ctx: AudioContext, worklet: AudioWorkletNode) {
    this.ctx = ctx;
    this.worklet = worklet;
    this.inGain = ctx.createGain();
    this.highpass = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 90, Q: 0.7 });
    this.formants = FORMANT_BASE.map((f) => new BiquadFilterNode(ctx, { type: 'peaking', frequency: f, Q: 5, gain: 0 }));
    this.comb = new DelayNode(ctx, { delayTime: 0.009, maxDelayTime: 0.05 });
    this.combFeedback = ctx.createGain();
    this.combWet = ctx.createGain();
    this.sum = ctx.createGain();
    this.lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 7800, Q: 0.6 });
    this.compressor = new DynamicsCompressorNode(ctx, { threshold: -22, knee: 12, ratio: 4, attack: 0.004, release: 0.12 });
    this.outGain = ctx.createGain();
    this.monitorGain = new GainNode(ctx, { gain: 0 });
    this.dest = ctx.createMediaStreamDestination();
    this.recordDest = ctx.createMediaStreamDestination();
    const inAnalyser = createAnalyser(ctx);
    const outAnalyser = createAnalyser(ctx);
    this.inputMeter = new LevelMeter(inAnalyser);
    this.outputMeter = new LevelMeter(outAnalyser);

    this.inGain.connect(inAnalyser);
    this.inGain.connect(this.highpass).connect(this.worklet);
    let node: AudioNode = this.worklet;
    for (const f of this.formants) node = node.connect(f);
    node.connect(this.sum);
    node.connect(this.comb);
    this.comb.connect(this.combFeedback).connect(this.comb);
    this.comb.connect(this.combWet).connect(this.sum);
    this.sum.connect(this.lowpass).connect(this.compressor).connect(this.outGain);
    this.outGain.connect(outAnalyser);
    this.outGain.connect(this.dest);
    this.outGain.connect(this.recordDest);
    this.outGain.connect(this.monitorGain).connect(ctx.destination);
    this.output = this.outGain;
  }

  static async create(): Promise<RobotVoiceChain> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    if (!ctx.audioWorklet) throw new Error('Este navegador não suporta AudioWorklet (necessário para a voz robótica).');
    await ctx.audioWorklet.addModule(WORKLET_URL);
    const node = new AudioWorkletNode(ctx, 'robot-voice-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    return new RobotVoiceChain(ctx, node);
  }

  setInput(stream: MediaStream | null) {
    this.source?.disconnect();
    this.source = stream ? this.ctx.createMediaStreamSource(stream) : null;
    this.source?.connect(this.inGain);
  }

  /** Faixa enviada via WebRTC. */
  get outputTrack(): MediaStreamTrack {
    return this.dest.stream.getAudioTracks()[0];
  }

  /** Stream separado para gravar a saudação sem interferir no envio ao vivo. */
  get recordStream(): MediaStream {
    return this.recordDest.stream;
  }

  apply(s: VoiceSettings) {
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, v: number) => param.setTargetAtTime(v, t, 0.03);
    const eff = s.enabled ? s.intensity : 0;
    const p = (name: string) => this.worklet.parameters.get(name)!;
    set(p('mix'), eff);
    set(p('pitch'), s.enabled ? s.pitch : 1);
    set(p('ringFreq'), s.ringFreq);
    set(p('ringMix'), s.enabled ? s.ringMix : 0);
    set(p('crush'), s.enabled ? s.crush : 0);
    set(p('gateDb'), s.gateDb);
    this.formants.forEach((f, i) => {
      set(f.frequency, FORMANT_BASE[i] * s.formant);
      set(f.gain, eff * (i === 0 ? 3 : 5.5));
    });
    set(this.comb.delayTime, 1 / (105 * s.formant));
    set(this.combFeedback.gain, Math.min(0.78, s.metallic * 0.8) * (s.enabled ? 1 : 0));
    set(this.combWet.gain, eff * s.metallic * 0.75);
    set(this.inGain.gain, s.inputGain);
    set(this.outGain.gain, s.outputGain);
  }

  setMonitor(on: boolean) {
    this.monitorGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  dispose() {
    this.source?.disconnect();
    this.outputTrack?.stop();
    void this.ctx.close();
  }
}
