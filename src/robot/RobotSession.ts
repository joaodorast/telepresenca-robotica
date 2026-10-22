import { CharacterController } from '../character/CharacterController';
import { FALLBACK_ICE } from '../config/env';
import { api } from '../lib/api';
import { LipSyncAnalyzer } from '../lib/audio/LipSyncAnalyzer';
import { createAnalyser, LevelMeter } from '../lib/audio/levels';
import { describeMediaError, requestCamera, requestMicrophone, stopStream } from '../lib/media/devices';
import { SignalingClient, type SignalingStatus } from '../lib/signaling/SignalingClient';
import { Store } from '../lib/store';
import { TelepresencePeer } from '../lib/webrtc/TelepresencePeer';
import {
  DEFAULT_CONFIG,
  type ControlAction,
  type DeviceState,
  type ExpressionId,
  type RobotActivity,
  type RobotStatus,
  type ServerMessage,
  type SessionConfig,
  type SignalData,
} from '../shared/protocol';

export interface RobotSnapshot {
  phase: 'standby' | 'starting' | 'running' | 'ended';
  signaling: SignalingStatus;
  operatorPresent: boolean;
  peerState: RTCPeerConnectionState | 'none';
  camera: DeviceState;
  mic: DeviceState;
  cameraError: string | null;
  micError: string | null;
  /** Texto exibido no balão enquanto a saudação é falada. */
  caption: string | null;
  reveal: boolean;
  endedReason: string | null;
}

const SPEAK_THRESHOLD = 0.07;
const LISTEN_THRESHOLD = 0.12;

/**
 * Lógica do dispositivo do personagem. Responsável por:
 *  - capturar câmera/microfone e enviá-los ao operador (nunca exibidos nesta tela);
 *  - reproduzir a voz robótica recebida e alimentar a sincronização labial com o MESMO áudio;
 *  - evitar realimentação (cancelamento de eco + modo half-duplex);
 *  - executar comandos do operador e reportar o estado real do personagem.
 */
export class RobotSession extends Store<RobotSnapshot> {
  readonly controller = new CharacterController();
  private signaling: SignalingClient;
  private peer: TelepresencePeer | null = null;
  private iceServers: RTCIceServer[] = FALLBACK_ICE;
  private ctx: AudioContext | null = null;
  private lipBus: GainNode | null = null;
  private greetGain: GainNode | null = null;
  private lip: LipSyncAnalyzer | null = null;
  private micMeter: LevelMeter | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private remoteSource: MediaStreamAudioSourceNode | null = null;
  private remoteTrackId: string | null = null;
  private audioEl: HTMLAudioElement;
  private camStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private config: SessionConfig = { ...DEFAULT_CONFIG };
  private configReceived = false;
  private greetedOnce = false;
  private loop: number | undefined;
  private cameraRetry: number | undefined;
  private lastSpeakAt = 0;
  private lastListenAt = 0;
  private lastStatus = '';
  private lastStatusAt = 0;
  private greetingSource: AudioBufferSourceNode | null = null;
  private decoded = new Map<string, AudioBuffer>();
  private wakeLock: { release(): Promise<void> } | null = null;
  private unsubs: (() => void)[] = [];

  constructor(token: string) {
    super({
      phase: 'standby',
      signaling: { state: 'idle', reason: null, rttMs: null, attempt: 0 },
      operatorPresent: false,
      peerState: 'none',
      camera: 'off',
      mic: 'off',
      cameraError: null,
      micError: null,
      caption: null,
      reveal: false,
      endedReason: null,
    });
    this.signaling = new SignalingClient(token);
    this.token = token;
    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;
    this.audioEl.setAttribute('playsinline', '');
    this.controller.awake = 0;
  }
  private readonly token: string;

  /** Deve ser chamado a partir de um toque/clique (desbloqueio de áudio e permissões). */
  async start() {
    if (this.snap.phase !== 'standby') return;
    this.patch({ phase: 'starting' });

    // Áudio: contexto criado no gesto do usuário para não ser bloqueado pelo navegador.
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume().catch(() => undefined);
    this.lipBus = this.ctx.createGain();
    this.greetGain = this.ctx.createGain();
    this.greetGain.connect(this.ctx.destination);
    this.lip = new LipSyncAnalyzer(this.ctx, this.lipBus);
    this.controller.mouthSource = () => this.lip!.sample();
    this.audioEl.volume = this.config.robotVolume;
    void this.audioEl.play().catch(() => undefined);

    void this.requestWakeLock();
    await Promise.all([this.startCamera(), this.startMic()]);

    this.unsubs.push(
      this.signaling.onStatus((s) => {
        this.patch({ signaling: s });
        if (s.state === 'closed' && s.reason) this.end(s.reason);
      }),
      this.signaling.onMessage((m) => void this.onMessage(m)),
    );
    try {
      const ice = await api.ice(this.token);
      this.iceServers = ice.iceServers;
    } catch (err) {
      console.warn('[robô] usando STUN padrão:', (err as Error).message);
    }
    this.signaling.connect();
    this.patch({ phase: 'running' });

    this.loop = window.setInterval(() => this.tick(), 100);
    // Se a configuração do operador não chegar a tempo, saúda com os valores padrão.
    window.setTimeout(() => this.maybeAutoGreet(), 2500);
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  // ------------------------------------------------------------ mídia local
  private async startCamera() {
    try {
      stopStream(this.camStream);
      this.camStream = await requestCamera();
      const track = this.camStream.getVideoTracks()[0];
      track.addEventListener('ended', () => {
        this.patch({ camera: 'error', cameraError: 'A câmera foi desconectada.' });
        this.controller.cameraActive = false;
        this.scheduleCameraRetry();
      });
      this.patch({ camera: 'on', cameraError: null });
      this.controller.cameraActive = true;
      await this.attachTracks(true);
    } catch (err) {
      this.camStream = null;
      this.controller.cameraActive = false;
      this.patch({ camera: 'error', cameraError: describeMediaError(err, 'câmera').message });
      this.scheduleCameraRetry();
    }
    this.sendStatus(true);
  }

  private scheduleCameraRetry() {
    window.clearTimeout(this.cameraRetry);
    if (this.snap.phase === 'ended') return;
    this.cameraRetry = window.setTimeout(() => {
      if (this.snap.camera !== 'on') void this.startCamera();
    }, 6000);
  }

  private async startMic() {
    try {
      stopStream(this.micStream);
      // Cancelamento de eco do navegador: remove a voz do robô captada pelo próprio microfone.
      this.micStream = await requestMicrophone({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      const track = this.micStream.getAudioTracks()[0];
      track.enabled = this.config.ambientAudio;
      track.addEventListener('ended', () => this.patch({ mic: 'error', micError: 'O microfone foi desconectado.' }));
      this.micSource?.disconnect();
      this.micSource = this.ctx!.createMediaStreamSource(this.micStream);
      const analyser = createAnalyser(this.ctx!);
      this.micSource.connect(analyser);
      this.micMeter = new LevelMeter(analyser);
      this.patch({ mic: 'on', micError: null });
      await this.attachTracks(false);
    } catch (err) {
      this.micStream = null;
      this.patch({ mic: 'error', micError: describeMediaError(err, 'microfone').message });
    }
    this.sendStatus(true);
  }

  private async attachTracks(cameraChanged: boolean) {
    if (!this.peer) return;
    await this.peer.setRobotTracks(this.camStream?.getVideoTracks()[0] ?? null, this.micStream?.getAudioTracks()[0] ?? null);
    // A câmera surgiu depois da negociação: pede ao operador uma nova oferta.
    if (cameraChanged) this.signaling.send({ type: 'signal', data: { kind: 'restart-request' } });
  }

  private onDeviceChange = () => {
    if (this.snap.camera === 'error') void this.startCamera();
    if (this.snap.mic === 'error') void this.startMic();
  };

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void this.ctx?.resume();
      void this.requestWakeLock();
    }
  };

  private async requestWakeLock() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      /* opcional */
    }
  }

  // ------------------------------------------------------------ sinalização
  private async onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'welcome':
        this.patch({ operatorPresent: m.peerPresent });
        if (m.config) this.applyConfig(m.config);
        this.configReceived = true;
        this.maybeAutoGreet();
        break;
      case 'peer-joined':
        this.patch({ operatorPresent: true });
        break;
      case 'peer-left':
        this.patch({ operatorPresent: false });
        this.closePeer();
        break;
      case 'config':
        this.applyConfig(m.config);
        break;
      case 'control':
        this.onControl(m.control);
        break;
      case 'signal':
        await this.onSignal(m.data).catch((err) => console.error('[robô] sinalização', err));
        break;
      case 'session-ended':
        this.end('A sessão foi encerrada pelo operador.');
        break;
    }
  }

  private async onSignal(d: SignalData) {
    if (d.kind === 'offer') {
      if (!this.peer || this.peer.id !== d.pcId) {
        this.closePeer();
        this.peer = new TelepresencePeer(d.pcId, this.iceServers, (data) => this.signaling.send({ type: 'signal', data }), {
          onRemoteStream: (stream) => this.onRemoteStream(stream),
          onConnectionState: (state) => {
            this.patch({ peerState: state });
            if (state === 'failed') this.signaling.send({ type: 'signal', data: { kind: 'restart-request' } });
          },
        });
        await this.peer.setRobotTracks(this.camStream?.getVideoTracks()[0] ?? null, this.micStream?.getAudioTracks()[0] ?? null);
      }
      await this.peer.handle(d);
    } else if (d.kind === 'candidate' && this.peer?.id === d.pcId) {
      await this.peer.handle(d);
    }
    this.sendStatus(true);
  }

  /**
   * A voz do operador toca pelo elemento <audio> (assim o cancelamento de eco do navegador a reconhece)
   * e, em paralelo, o mesmo stream alimenta o analisador de visemas — a boca segue o áudio realmente reproduzido.
   */
  private onRemoteStream(stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    if (!track || !this.ctx || !this.lipBus) return;
    if (this.audioEl.srcObject !== stream) this.audioEl.srcObject = stream;
    void this.audioEl.play().catch(() => undefined);
    if (this.remoteTrackId !== track.id) {
      this.remoteSource?.disconnect();
      this.remoteSource = this.ctx.createMediaStreamSource(new MediaStream([track]));
      this.remoteSource.connect(this.lipBus);
      this.remoteTrackId = track.id;
    }
  }

  private closePeer() {
    this.peer?.close();
    this.peer = null;
    this.remoteSource?.disconnect();
    this.remoteSource = null;
    this.remoteTrackId = null;
    this.audioEl.srcObject = null;
    this.patch({ peerState: 'none' });
  }

  private applyConfig(c: Partial<SessionConfig>) {
    this.config = { ...this.config, ...c };
    this.audioEl.volume = Math.min(1, Math.max(0, this.config.robotVolume));
    this.greetGain?.gain.setTargetAtTime(this.config.robotVolume, this.ctx!.currentTime, 0.05);
    const mic = this.micStream?.getAudioTracks()[0];
    if (mic && !this.config.halfDuplex) mic.enabled = this.config.ambientAudio;
    this.sendStatus(true);
  }

  private onControl(c: ControlAction) {
    if (c.action === 'expression') this.controller.manualExpression = c.expression;
    else if (c.action === 'greet') void this.greet();
    else if (c.action === 'reveal') this.patch({ reveal: c.show });
    this.sendStatus(true);
  }

  // ------------------------------------------------------------ saudação
  private maybeAutoGreet() {
    if (this.greetedOnce || this.snap.phase !== 'running') return;
    if (!this.configReceived && this.signaling.current.state === 'open') return; // aguarda a configuração
    this.greetedOnce = true;
    if (this.config.autoGreeting) void this.greet();
    else this.controller.awake = 1;
  }

  async greet() {
    if (this.snap.phase !== 'running') return;
    this.greetingSource?.stop();
    window.speechSynthesis?.cancel();
    const cfg = this.config;
    await this.controller.playGreeting({
      wave: true,
      speak: async (cancelled) => {
        this.patch({ caption: cfg.greetingText });
        try {
          if (cfg.greetingVoice === 'recorded' && cfg.greetingAudio) await this.playRecorded(cfg.greetingAudio, cancelled);
          else await this.speakTts(cfg, cancelled);
        } finally {
          window.setTimeout(() => this.patch({ caption: null }), 900);
        }
      },
    });
  }

  /** Saudação gravada pelo operador já com a voz robótica — boca guiada pela análise do áudio. */
  private async playRecorded(dataUrl: string, cancelled: () => boolean) {
    const ctx = this.ctx!;
    let buffer = this.decoded.get(dataUrl);
    if (!buffer) {
      const bytes = await (await fetch(dataUrl)).arrayBuffer();
      buffer = await ctx.decodeAudioData(bytes);
      this.decoded.clear();
      this.decoded.set(dataUrl, buffer);
    }
    if (cancelled()) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.greetGain!);
    src.connect(this.lipBus!);
    this.greetingSource = src;
    await new Promise<void>((resolve) => {
      src.onended = () => resolve();
      src.start();
    });
    this.greetingSource = null;
  }

  /** Síntese de voz do navegador (pt-BR). A boca segue visemas estimados a partir do texto. */
  private async speakTts(cfg: SessionConfig, cancelled: () => boolean) {
    const synth = window.speechSynthesis;
    const viz = this.controller.textVisemes;
    if (!synth) {
      viz.start(cfg.greetingText, cfg.ttsRate);
      await new Promise((r) => setTimeout(r, viz.estimatedDuration * 1000));
      viz.stop();
      return;
    }
    const voices = await loadVoices();
    const pt = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('pt-br'));
    const voice = pt.find((v) => /google|francisca|luciana|maria/i.test(v.name)) ?? pt[0] ?? voices.find((v) => v.lang.startsWith('pt'));
    const u = new SpeechSynthesisUtterance(cfg.greetingText);
    u.lang = 'pt-BR';
    if (voice) u.voice = voice;
    u.pitch = cfg.ttsPitch;
    u.rate = cfg.ttsRate;
    u.volume = cfg.robotVolume;
    await new Promise<void>((resolve) => {
      const done = () => {
        viz.stop();
        window.clearTimeout(guard);
        resolve();
      };
      u.onstart = () => viz.start(cfg.greetingText, cfg.ttsRate);
      u.onboundary = (e) => viz.syncTo(e.charIndex);
      u.onend = done;
      u.onerror = done;
      const guard = window.setTimeout(done, cfg.greetingText.length * 140 + 4000);
      const poll = window.setInterval(() => {
        if (cancelled()) {
          synth.cancel();
          window.clearInterval(poll);
          done();
        }
        if (!this.controller.greeting) window.clearInterval(poll);
      }, 200);
      synth.speak(u);
    });
  }

  // ------------------------------------------------------------ estado real
  private tick() {
    const now = performance.now();
    const speakingNow = (this.lip?.level ?? 0) > SPEAK_THRESHOLD || this.controller.textVisemes.isActive();
    if (speakingNow) this.lastSpeakAt = now;
    const speaking = now - this.lastSpeakAt < 350;

    // Half-duplex: enquanto o personagem fala, o microfone local deixa de transmitir (sem eco para o operador).
    const mic = this.micStream?.getAudioTracks()[0];
    if (mic) mic.enabled = this.config.ambientAudio && !(this.config.halfDuplex && speaking);

    const micLevel = mic?.enabled ? (this.micMeter?.level ?? 0) : 0;
    if (!speaking && micLevel > LISTEN_THRESHOLD) this.lastListenAt = now;
    const listening = !speaking && now - this.lastListenAt < 900;

    let activity: RobotActivity = 'waiting';
    if (this.controller.greeting) activity = 'greeting';
    else if (speaking) activity = 'speaking';
    else if (listening) activity = 'listening';

    const auto: ExpressionId = speaking ? 'talking' : listening ? 'listening' : 'neutral';
    this.controller.autoExpression = auto;
    if (!this.controller.greeting && this.controller.awake < 1 && this.greetedOnce) this.controller.awake = 1;
    this.sendStatus(false, activity);
  }

  private currentActivity: RobotActivity = 'waiting';
  private sendStatus(force: boolean, activity?: RobotActivity) {
    if (activity) this.currentActivity = activity;
    const status: RobotStatus = {
      activity: this.currentActivity,
      expression: this.controller.expression,
      manual: this.controller.manualExpression !== null,
      camera: this.snap.camera,
      mic: this.snap.mic,
      cameraError: this.snap.cameraError,
      micError: this.snap.micError,
      audioUnlocked: this.ctx?.state === 'running',
    };
    const key = JSON.stringify(status);
    const now = performance.now();
    if (!force && key === this.lastStatus && now - this.lastStatusAt < 2000) return;
    this.lastStatus = key;
    this.lastStatusAt = now;
    this.signaling.send({ type: 'status', status });
  }

  // ------------------------------------------------------------ encerramento
  private end(reason: string) {
    if (this.snap.phase === 'ended') return;
    this.cleanup();
    this.controller.cancelGreeting();
    this.controller.awake = 0;
    this.patch({ phase: 'ended', endedReason: reason, caption: null, reveal: false, camera: 'off', mic: 'off' });
  }

  private cleanup() {
    window.clearInterval(this.loop);
    window.clearTimeout(this.cameraRetry);
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.signaling.close();
    this.closePeer();
    this.greetingSource?.stop();
    window.speechSynthesis?.cancel();
    stopStream(this.camStream);
    stopStream(this.micStream);
    this.camStream = this.micStream = null;
    this.controller.cameraActive = false;
    this.controller.mouthSource = null;
    this.lip?.dispose();
    void this.ctx?.close();
    this.ctx = null;
    void this.wakeLock?.release().catch(() => undefined);
  }

  dispose() {
    this.cleanup();
  }
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(synth.getVoices()), 1200);
    synth.addEventListener('voiceschanged', () => {
      window.clearTimeout(t);
      resolve(synth.getVoices());
    }, { once: true });
  });
}
