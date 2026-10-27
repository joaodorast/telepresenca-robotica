// Contrato de mensagens entre /operator, /robot e o servidor de sinalização.

export type Role = 'operator' | 'robot';

export type ExpressionId =
  | 'neutral'
  | 'happy'
  | 'smiling'
  | 'surprised'
  | 'sad'
  | 'angry'
  | 'confused'
  | 'attentive'
  | 'talking'
  | 'listening'
  | 'greeting';

/** Estado real do personagem, derivado do áudio e da sequência em execução no dispositivo do robô. */
export type RobotActivity = 'waiting' | 'listening' | 'speaking' | 'greeting';

export type DeviceState = 'off' | 'on' | 'error';

export interface SessionConfig {
  greetingText: string;
  autoGreeting: boolean;
  /** 'recorded' = saudação gravada pelo operador com a voz robótica; 'tts' = síntese do navegador. */
  greetingVoice: 'tts' | 'recorded';
  /** Áudio gravado (data URL) quando greetingVoice === 'recorded'. */
  greetingAudio: string | null;
  ttsPitch: number;
  ttsRate: number;
  /** Silencia o microfone do robô enquanto ele fala, evitando eco/realimentação. */
  halfDuplex: boolean;
  /** Volume de reprodução no dispositivo do robô (0–1). */
  robotVolume: number;
  /** Envia o áudio ambiente do robô para o operador. */
  ambientAudio: boolean;
}

export const DEFAULT_CONFIG: SessionConfig = {
  greetingText: 'Olá! Tudo bem? Prazer em conhecer você!',
  autoGreeting: true,
  greetingVoice: 'tts',
  greetingAudio: null,
  ttsPitch: 0.8,
  ttsRate: 1,
  halfDuplex: false,
  robotVolume: 0.9,
  ambientAudio: true,
};

export type ControlAction =
  | { action: 'expression'; expression: ExpressionId | null }
  | { action: 'greet' }
  | { action: 'reveal'; show: boolean };

export interface RobotStatus {
  activity: RobotActivity;
  /** Expressão efetivamente exibida. */
  expression: ExpressionId;
  manual: boolean;
  camera: DeviceState;
  mic: DeviceState;
  cameraError: string | null;
  micError: string | null;
  audioUnlocked: boolean;
}

export type SignalData =
  | { kind: 'offer'; pcId: string; sdp: string }
  | { kind: 'answer'; pcId: string; sdp: string }
  | { kind: 'candidate'; pcId: string; candidate: RTCIceCandidateInit }
  | { kind: 'restart-request' };

export type ServerMessage =
  | { type: 'welcome'; role: Role; sessionId: string; peerPresent: boolean; config: Partial<SessionConfig> | null }
  | { type: 'peer-joined'; role: Role }
  | { type: 'peer-left'; role: Role }
  | { type: 'signal'; from: Role; data: SignalData }
  | { type: 'control'; control: ControlAction }
  | { type: 'config'; config: Partial<SessionConfig> }
  | { type: 'status'; status: RobotStatus }
  | { type: 'pong'; t: number }
  | { type: 'session-ended' }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'signal'; data: SignalData }
  | { type: 'control'; control: ControlAction }
  | { type: 'config'; config: Partial<SessionConfig> }
  | { type: 'status'; status: RobotStatus }
  | { type: 'ping'; t: number }
  | { type: 'end' };

/** Códigos de fechamento usados pelo servidor. */
export const CLOSE = { REPLACED: 4001, INVALID_TOKEN: 4003, SESSION_ENDED: 4004 } as const;
