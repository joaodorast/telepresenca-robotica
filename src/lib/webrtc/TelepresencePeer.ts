import type { SignalData } from '../../shared/protocol';

export interface PeerStats {
  rttMs: number | null;
  video: { width: number; height: number; fps: number } | null;
  /** Perda de pacotes de vídeo no último intervalo (%). */
  lossPct: number | null;
  /** true quando a mídia passa por um servidor TURN. */
  relayed: boolean | null;
  inboundKbps: number | null;
}

export interface PeerCallbacks {
  onRemoteStream(stream: MediaStream): void;
  onConnectionState(state: RTCPeerConnectionState): void;
}

export const newPeerId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Encapsula um RTCPeerConnection.
 * Topologia: o operador sempre cria a oferta com
 *   - 1 transceiver de áudio sendrecv (voz robótica → robô, áudio ambiente ← robô)
 *   - 1 transceiver de vídeo recvonly (câmera do robô → operador)
 * O robô apenas responde e anexa câmera/microfone. O operador nunca envia vídeo.
 */
export class TelepresencePeer {
  readonly pc: RTCPeerConnection;
  readonly remoteStream = new MediaStream();
  private pending: RTCIceCandidateInit[] = [];
  private closed = false;
  private robotVideo: MediaStreamTrack | null = null;
  private robotAudio: MediaStreamTrack | null = null;
  private last = { lost: 0, received: 0, bytes: 0, at: 0 };

  constructor(
    readonly id: string,
    iceServers: RTCIceServer[],
    private readonly send: (d: SignalData) => void,
    private readonly cb: PeerCallbacks,
  ) {
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ kind: 'candidate', pcId: this.id, candidate: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => {
      if (!this.remoteStream.getTracks().includes(e.track)) this.remoteStream.addTrack(e.track);
      this.cb.onRemoteStream(this.remoteStream);
      e.track.onunmute = () => this.cb.onRemoteStream(this.remoteStream);
    };
    this.pc.onconnectionstatechange = () => this.cb.onConnectionState(this.pc.connectionState);
  }

  // ------------------------------------------------------------ operador
  async startAsOperator(voiceTrack: MediaStreamTrack | null) {
    const audio = this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (voiceTrack) await audio.sender.replaceTrack(voiceTrack);
    this.pc.addTransceiver('video', { direction: 'recvonly' });
    await this.offer(false);
  }

  async offer(iceRestart: boolean) {
    if (this.closed) return;
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    this.send({ kind: 'offer', pcId: this.id, sdp: offer.sdp ?? '' });
  }

  async setVoiceTrack(track: MediaStreamTrack | null) {
    const t = this.pc.getTransceivers().find((x) => x.receiver.track.kind === 'audio');
    if (t) await t.sender.replaceTrack(track);
  }

  // ------------------------------------------------------------ robô
  async setRobotTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null) {
    this.robotVideo = video;
    this.robotAudio = audio;
    for (const t of this.pc.getTransceivers()) {
      if (t.receiver.track.kind === 'video') await t.sender.replaceTrack(video);
      else await t.sender.replaceTrack(audio);
    }
  }

  // ------------------------------------------------------------ comum
  async handle(d: SignalData) {
    if (this.closed || d.kind === 'restart-request') return;
    if (d.kind === 'offer') {
      await this.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
      for (const t of this.pc.getTransceivers()) {
        if (t.receiver.track.kind === 'video') {
          await t.sender.replaceTrack(this.robotVideo);
          t.direction = this.robotVideo ? 'sendonly' : 'inactive';
        } else {
          await t.sender.replaceTrack(this.robotAudio);
          t.direction = 'sendrecv';
        }
      }
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send({ kind: 'answer', pcId: this.id, sdp: answer.sdp ?? '' });
      await this.flush();
    } else if (d.kind === 'answer') {
      if (this.pc.signalingState !== 'have-local-offer') return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
      await this.flush();
    } else if (d.kind === 'candidate') {
      if (!this.pc.remoteDescription) this.pending.push(d.candidate);
      else await this.pc.addIceCandidate(d.candidate).catch(() => undefined);
    }
  }

  private async flush() {
    const list = this.pending;
    this.pending = [];
    for (const c of list) await this.pc.addIceCandidate(c).catch(() => undefined);
  }

  /** Estatísticas reais extraídas de getStats(). */
  async stats(): Promise<PeerStats> {
    const out: PeerStats = { rttMs: null, video: null, lossPct: null, relayed: null, inboundKbps: null };
    if (this.closed) return out;
    const report = await this.pc.getStats();
    let pairId: string | undefined;
    const byId = new Map<string, Record<string, any>>();
    report.forEach((s: Record<string, any>) => {
      byId.set(s.id, s);
      if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
    });
    let pair = pairId ? byId.get(pairId) : undefined;
    if (!pair) {
      for (const s of byId.values()) if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s;
    }
    if (pair) {
      if (typeof pair.currentRoundTripTime === 'number') out.rttMs = Math.round(pair.currentRoundTripTime * 1000);
      const local = byId.get(pair.localCandidateId);
      const remote = byId.get(pair.remoteCandidateId);
      out.relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
    }
    let bytes = 0;
    for (const s of byId.values()) {
      if (s.type !== 'inbound-rtp') continue;
      bytes += s.bytesReceived ?? 0;
      if (s.kind === 'video') {
        if (s.frameWidth) out.video = { width: s.frameWidth, height: s.frameHeight, fps: Math.round(s.framesPerSecond ?? 0) };
        const lost = s.packetsLost ?? 0;
        const received = s.packetsReceived ?? 0;
        const dl = lost - this.last.lost;
        const dr = received - this.last.received;
        if (dl + dr > 0 && this.last.at) out.lossPct = Math.max(0, Math.round((dl / (dl + dr)) * 1000) / 10);
        this.last.lost = lost;
        this.last.received = received;
      }
    }
    const now = performance.now();
    if (this.last.at && bytes >= this.last.bytes) {
      out.inboundKbps = Math.round(((bytes - this.last.bytes) * 8) / (now - this.last.at));
    }
    this.last.bytes = bytes;
    this.last.at = now;
    return out;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
