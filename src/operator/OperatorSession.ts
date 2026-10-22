import { CharacterController } from '../character/CharacterController';
import { FALLBACK_ICE } from '../config/env';
import { api, type SessionCredentials } from '../lib/api';
import { LipSyncAnalyzer } from '../lib/audio/LipSyncAnalyzer';
import { RobotVoiceChain } from '../lib/audio/RobotVoiceChain';
import { createAnalyser, LevelMeter } from '../lib/audio/levels';
import { DEFAULT_VOICE, VOICE_PRESETS, type VoiceSettings } from '../lib/audio/voicePresets';
import { describeMediaError, requestMicrophone, stopStream } from '../lib/media/devices';
import { SignalingClient, type SignalingStatus } from '../lib/signaling/SignalingClient';
import { Store } from '../lib/store';
import { newPeerId, TelepresencePeer, type PeerStats } from '../lib/webrtc/TelepresencePeer';
import { DEFAULT_CONFIG, type ExpressionId, type RobotStatus, type ServerMessage, type SessionConfig } from '../shared/protocol';

export type MicState = 'off' | 'on' | 'muted' | 'error';

export interface OperatorSnapshot {
  phase: 'idle' | 'starting' | 'live' | 'ended';
  signaling: SignalingStatus;
  robotPresent: boolean;
  peerState: RTCPeerConnectionState | 'none';
  stats: PeerStats | null;
  iceWarnings: string[];
  mic: MicState;
  micError: string | null;
  error: string | null;
  robot: RobotStatus | null;
  remoteStream: MediaStream | null;
  hasRemoteVideo: boolean;
  connectedAt: number | null;
  config: SessionConfig;
  voice: VoiceSettings;
  voicePreset: string | null;
  manualExpression: ExpressionId | null;
  remoteVolume: number;
  remoteMuted: boolean;
  monitor: boolean;
  micDeviceId: string | null;
  outputDeviceId: string | null;
  recording: 'idle' | 'recording';
  revealShown: boolean;
}

const LS_CONFIG = 'tp.operator.config';
const LS_VOICE = 'tp.operator.voice';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem persistir */
  }
}

/**
 * Lógica da central do operador: voz robótica, conexão WebRTC, comandos ao personagem e
 * estatísticas reais da conexão. Os componentes React apenas leem o snapshot e chamam ações.
 */
export class OperatorSession extends Store<OperatorSnapshot> {
  /** Personagem da pré-visualização: reflete o estado reportado pelo robô. */
  readonly preview = new CharacterController();
  private signaling: SignalingClient;
  private peer: TelepresencePeer | null = null;
  private iceServers: RTCIceServer[] = FALLBACK_ICE;
  private chain: RobotVoiceChain | null = null;
  private micStream: MediaStream | null = null;
  private previewLip: LipSyncAnalyzer | null = null;
  private remoteMeter: LevelMeter | null = null;
  private remoteSource: MediaStreamAudioSourceNode | null = null;
  private remoteAudio: HTMLAudioElement;
  private statsTimer: number | undefined;
  private restartTimer: number | undefined;
  private recorder: MediaRecorder | null = null;
  private unsubs: (() => void)[] = [];

  constructor(readonly creds: SessionCredentials) {
    const voice = load(LS_VOICE, DEFAULT_VOICE);
    super({
      phase: 'idle',
      signaling: { state: 'idle', reason: null, rttMs: null, attempt: 0 },
      robotPresent: false,
      peerState: 'none',
      stats: null,
      iceWarnings: [],
      mic: 'off',
      micError: null,
      error: null,
      robot: null,
      remoteStream: null,
      hasRemoteVideo: false,
      connectedAt: null,
      config: load(LS_CONFIG, DEFAULT_CONFIG),
      voice,
      voicePreset: matchPreset(voice),
      manualExpression: null,
      remoteVolume: 0.8,
      remoteMuted: false,
      monitor: false,
      micDeviceId: null,
      outputDeviceId: null,
      recording: 'idle',
      revealShown: false,
    });
    this.signaling = new SignalingClient(creds.operatorToken);
    this.remoteAudio = document.createElement('audio');
    this.remoteAudio.autoplay = true;
    this.preview.awake = 0;
  }

  // ------------------------------------------------------------ níveis (lidos por medidores via rAF)
  get micLevel() {
    return this.snap.mic === 'on' ? (this.chain?.inputMeter.level ?? 0) : 0;
  }
  get voiceLevel() {
    return this.snap.mic === 'on' ? (this.chain?.outputMeter.level ?? 0) : 0;
  }
  get remoteLevel() {
    return this.remoteMeter?.level ?? 0;
  }

  // ------------------------------------------------------------ ciclo de vida
  async start() {
    if (this.snap.phase === 'starting' || this.snap.phase === 'live') return;
    this.patch({ phase: 'starting', error: null });
    try {
      this.chain = await RobotVoiceChain.create();
      await this.chain.resume();
      this.chain.apply(this.snap.voice);
      this.previewLip = new LipSyncAnalyzer(this.chain.ctx, this.chain.output);
      this.preview.mouthSource = () => this.previewLip!.sample();
    } catch (err) {
      this.patch({ phase: 'idle', error: (err as Error).message });
      return;
    }
    await this.acquireMic();
    try {
      const ice = await api.ice(this.creds.operatorToken);
      this.iceServers = ice.iceServers;
      this.patch({ iceWarnings: ice.warnings });
    } catch (err) {
      this.patch({ iceWarnings: [`Não foi possível obter servidores TURN: ${(err as Error).message}`] });
    }
    this.unsubs.push(
      this.signaling.onStatus((s) => {
        this.patch({ signaling: s });
        if (s.state === 'closed' && s.reason) this.teardown(s.reason);
      }),
      this.signaling.onMessage((m) => void this.onMessage(m)),
    );
    this.signaling.connect();
    this.statsTimer = window.setInterval(() => void this.pollStats(), 1000);
    this.patch({ phase: 'live' });
  }

  /** Encerra a sessão para ambos os lados (o link do robô deixa de funcionar). */
  endSession() {
    this.signaling.send({ type: 'end' });
    window.setTimeout(() => this.teardown(null), 150);
  }

  private teardown(reason: string | null) {
    if (this.snap.phase === 'ended') return;
    window.clearInterval(this.statsTimer);
    window.clearTimeout(this.restartTimer);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.recorder?.stop();
    this.signaling.close();
    this.closePeer();
    stopStream(this.micStream);
    this.micStream = null;
    this.previewLip?.dispose();
    this.preview.mouthSource = null;
    this.preview.cancelGreeting();
    this.preview.awake = 0;
    this.chain?.dispose();
    this.chain = null;
    this.patch({ phase: 'ended', error: reason, mic: 'off', robot: null, robotPresent: false });
  }

  dispose() {
    this.teardown(null);
  }

  // ------------------------------------------------------------ microfone e voz
  private async acquireMic() {
    try {
      stopStream(this.micStream);
      this.micStream = await requestMicrophone({
        deviceId: this.snap.micDeviceId ?? undefined,
        echoCancellation: true,
        noiseSuppression: this.snap.voice.noiseSuppression,
        autoGainControl: false,
      });
      this.micStream.getAudioTracks()[0].addEventListener('ended', () =>
        this.patch({ mic: 'error', micError: 'O microfone foi desconectado.' }),
      );
      this.chain!.setInput(this.micStream);
      const muted = this.snap.mic === 'muted';
      this.chain!.outputTrack.enabled = !muted;
      this.patch({ mic: muted ? 'muted' : 'on', micError: null });
    } catch (err) {
      this.patch({ mic: 'error', micError: describeMediaError(err, 'microfone').message });
    }
  }

  retryMic() {
    if (this.chain) void this.acquireMic();
  }

  toggleMic() {
    if (!this.chain || this.snap.mic === 'error' || this.snap.mic === 'off') return;
    const muted = this.snap.mic !== 'muted';
    this.chain.outputTrack.enabled = !muted;
    this.patch({ mic: muted ? 'muted' : 'on' });
  }

  setVoice(p: Partial<VoiceSettings>) {
    const voice = { ...this.snap.voice, ...p };
    this.chain?.apply(voice);
    save(LS_VOICE, voice);
    const nsChanged = p.noiseSuppression !== undefined && p.noiseSuppression !== this.snap.voice.noiseSuppression;
    this.patch({ voice, voicePreset: matchPreset(voice) });
    if (nsChanged) void this.acquireMic();
  }

  applyPreset(id: string) {
    const preset = VOICE_PRESETS[id];
    if (preset) this.setVoice({ ...preset.settings, enabled: true });
  }

  setMonitor(on: boolean) {
    this.chain?.setMonitor(on);
    this.patch({ monitor: on });
  }

  async setMicDevice(deviceId: string) {
    this.patch({ micDeviceId: deviceId || null });
    if (this.chain) await this.acquireMic();
  }

  async setOutputDevice(deviceId: string) {
    const el = this.remoteAudio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    try {
      await el.setSinkId?.(deviceId);
      this.patch({ outputDeviceId: deviceId || null });
    } catch (err) {
      this.patch({ error: `Não foi possível trocar a saída de áudio: ${(err as Error).message}` });
    }
  }

  setRemoteVolume(v: number) {
    this.remoteAudio.volume = v;
    this.patch({ remoteVolume: v });
  }

  toggleRemoteMute() {
    const muted = !this.snap.remoteMuted;
    this.remoteAudio.muted = muted;
    this.patch({ remoteMuted: muted });
  }

  // ------------------------------------------------------------ comandos ao personagem
  setExpression(expression: ExpressionId | null) {
    this.signaling.send({ type: 'control', control: { action: 'expression', expression } });
    this.patch({ manualExpression: expression });
  }

  greet() {
    this.signaling.send({ type: 'control', control: { action: 'greet' } });
  }

  reveal(show: boolean) {
    this.signaling.send({ type: 'control', control: { action: 'reveal', show } });
    this.patch({ revealShown: show });
  }

  setConfig(p: Partial<SessionConfig>) {
    const config = { ...this.snap.config, ...p };
    save(LS_CONFIG, config);
    this.patch({ config });
    this.signaling.send({ type: 'config', config: p });
  }

  /**
   * Grava a saudação com a voz robótica atual. O envio ao vivo é pausado durante a gravação
   * para que a pessoa diante do robô não ouça o ensaio.
   */
  async startRecording() {
    if (!this.chain || this.snap.recording === 'recording' || this.snap.mic !== 'on') return;
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(this.chain.recordStream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const live = this.chain.outputTrack;
    await this.peer?.setVoiceTrack(null);
    rec.onstop = async () => {
      window.clearTimeout(limit);
      await this.peer?.setVoiceTrack(live);
      this.recorder = null;
      this.patch({ recording: 'idle' });
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      if (blob.size < 2000) return;
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > 600_000) {
        this.patch({ error: 'Gravação longa demais. Grave até 10 segundos.' });
        return;
      }
      this.setConfig({ greetingAudio: dataUrl, greetingVoice: 'recorded' });
    };
    const limit = window.setTimeout(() => rec.state === 'recording' && rec.stop(), 10_000);
    this.recorder = rec;
    rec.start();
    this.patch({ recording: 'recording' });
  }

  stopRecording() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  // ------------------------------------------------------------ sinalização e WebRTC
  private async onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'welcome':
        // Sincroniza a configuração atual com o servidor (que a repassa ao robô).
        this.signaling.send({ type: 'config', config: this.snap.config });
        if (this.snap.manualExpression) this.setExpression(this.snap.manualExpression);
        this.patch({ robotPresent: m.peerPresent });
        // A mídia é P2P: se a sinalização apenas reconectou e o WebRTC segue ativo, não renegocia.
        if (m.peerPresent && this.peer?.pc.connectionState !== 'connected') await this.startPeer();
        break;
      case 'peer-joined':
        this.patch({ robotPresent: true });
        await this.startPeer();
        break;
      case 'peer-left':
        this.closePeer();
        this.preview.cancelGreeting();
        this.preview.awake = 0;
        this.patch({ robotPresent: false, robot: null });
        break;
      case 'status':
        this.onRobotStatus(m.status);
        break;
      case 'signal':
        if (m.data.kind === 'restart-request') {
          if (this.peer) await this.peer.offer(true);
          else if (this.snap.robotPresent) await this.startPeer();
        } else if ((m.data.kind === 'answer' || m.data.kind === 'candidate') && this.peer?.id === m.data.pcId) {
          await this.peer.handle(m.data).catch((err) => console.error('[operador] sinalização', err));
        }
        break;
      case 'session-ended':
        this.teardown('Sessão encerrada.');
        break;
      case 'error':
        console.warn('[operador] servidor:', m.message);
        break;
    }
  }

  private onRobotStatus(s: RobotStatus) {
    this.patch({ robot: s });
    const p = this.preview;
    p.awake = 1;
    p.cameraActive = s.camera === 'on';
    p.autoExpression = s.expression;
    if (s.activity === 'greeting' && !p.greeting) {
      // Reproduz a coreografia na pré-visualização enquanto o robô a executa de fato.
      void p.playGreeting({
        wave: true,
        speak: (cancelled) =>
          new Promise<void>((resolve) => {
            const t = window.setInterval(() => {
              if (cancelled() || this.snap.robot?.activity !== 'greeting') {
                window.clearInterval(t);
                resolve();
              }
            }, 150);
          }),
      });
    }
  }

  private async startPeer() {
    this.closePeer();
    const peer = new TelepresencePeer(newPeerId(), this.iceServers, (data) => this.signaling.send({ type: 'signal', data }), {
      onRemoteStream: (stream) => this.onRemoteStream(stream),
      onConnectionState: (state) => this.onPeerState(state),
    });
    this.peer = peer;
    this.patch({ peerState: 'new' });
    const voice = this.chain && this.snap.recording !== 'recording' ? this.chain.outputTrack : null;
    await peer.startAsOperator(voice).catch((err) => this.patch({ error: `Falha ao negociar mídia: ${(err as Error).message}` }));
  }

  private onPeerState(state: RTCPeerConnectionState) {
    this.patch({ peerState: state });
    window.clearTimeout(this.restartTimer);
    if (state === 'connected' && !this.snap.connectedAt) this.patch({ connectedAt: Date.now() });
    if (state === 'failed') {
      // Reinicia o ICE (pode passar a usar TURN) sem derrubar a sessão.
      this.restartTimer = window.setTimeout(() => void this.peer?.offer(true), 800);
    } else if (state === 'disconnected') {
      this.restartTimer = window.setTimeout(() => {
        if (this.peer?.pc.connectionState === 'disconnected') void this.peer.offer(true);
      }, 4000);
    }
  }

  private onRemoteStream(stream: MediaStream) {
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];
    this.remoteAudio.srcObject = stream;
    this.remoteAudio.volume = this.snap.remoteVolume;
    this.remoteAudio.muted = this.snap.remoteMuted;
    void this.remoteAudio.play().catch(() => undefined);
    if (audio && this.chain && !this.remoteSource) {
      this.remoteSource = this.chain.ctx.createMediaStreamSource(new MediaStream([audio]));
      const a = createAnalyser(this.chain.ctx);
      this.remoteSource.connect(a);
      this.remoteMeter = new LevelMeter(a);
    }
    this.patch({ remoteStream: stream, hasRemoteVideo: !!video && !video.muted && video.readyState === 'live' });
  }

  private closePeer() {
    this.peer?.close();
    this.peer = null;
    this.remoteSource?.disconnect();
    this.remoteSource = null;
    this.remoteMeter = null;
    this.remoteAudio.srcObject = null;
    this.patch({ peerState: 'none', remoteStream: null, hasRemoteVideo: false, stats: null, connectedAt: null });
  }

  private async pollStats() {
    if (!this.peer || this.peer.pc.connectionState !== 'connected') return;
    try {
      const stats = await this.peer.stats();
      const video = this.snap.remoteStream?.getVideoTracks()[0];
      this.patch({ stats, hasRemoteVideo: !!stats.video && !!video && !video.muted });
    } catch {
      /* conexão fechando */
    }
  }
}

function matchPreset(v: VoiceSettings): string | null {
  for (const [id, p] of Object.entries(VOICE_PRESETS)) {
    const s = p.settings as Record<string, number>;
    if (Object.keys(s).every((k) => Math.abs((v as unknown as Record<string, number>)[k] - s[k]) < 1e-3)) return id;
  }
  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
