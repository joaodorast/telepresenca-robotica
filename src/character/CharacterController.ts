import type { ExpressionId } from '../shared/protocol';
import type { MouthFrame } from '../lib/audio/LipSyncAnalyzer';
import { TextVisemePlayer } from '../lib/audio/TextVisemes';

export interface GreetingOptions {
  wave: boolean;
  /** Executa a fala; deve resolver quando o áudio terminar. */
  speak: (isCancelled: () => boolean) => Promise<void>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Estado-alvo do personagem, fora do React. A cena 3D lê estes campos a cada quadro e
 * interpola suavemente — assim as mudanças de expressão nunca são bruscas e a UI não
 * re-renderiza a cada amostra de áudio.
 */
export class CharacterController {
  /** Expressão escolhida pelo operador (null = automática). */
  manualExpression: ExpressionId | null = null;
  /** Expressão derivada do estado real: falando, escutando ou repouso. */
  autoExpression: ExpressionId = 'neutral';
  /** Expressão imposta pela sequência de saudação. */
  sequenceExpression: ExpressionId | null = null;

  /** 0 = adormecido (olhos fechados, cabeça baixa), 1 = desperto. */
  awake = 0;
  waving = false;
  /** Inclinação extra da cabeça usada na saudação. */
  tiltBoost = 0;
  /** Fixa o olhar na câmera (sem sacadas) durante a apresentação. */
  gazeLock = false;
  /** Força uma piscada no próximo quadro. */
  blinkRequest = false;
  cameraActive = false;

  /** Fonte de boca em tempo real (análise de áudio). */
  mouthSource: (() => MouthFrame) | null = null;
  /** Visemas por texto (apenas síntese de voz do navegador). */
  readonly textVisemes = new TextVisemePlayer();

  greeting = false;
  private token = 0;
  private listeners = new Set<() => void>();

  get expression(): ExpressionId {
    return this.sequenceExpression ?? this.manualExpression ?? this.autoExpression;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  cancelGreeting() {
    this.token++;
    this.textVisemes.stop();
    this.sequenceExpression = null;
    this.waving = false;
    this.tiltBoost = 0;
    this.gazeLock = false;
    this.awake = 1;
    if (this.greeting) {
      this.greeting = false;
      this.emit();
    }
  }

  /**
   * Sequência de apresentação: desperta → abre os olhos e olha para a câmera → inclina a cabeça
   * → sorri → acena → fala (com sincronização labial) → retorna ao repouso.
   */
  async playGreeting(opts: GreetingOptions) {
    const my = ++this.token;
    const alive = () => my === this.token;
    this.greeting = true;
    this.emit();

    const startedAwake = this.awake > 0.5;
    this.sequenceExpression = 'neutral';
    this.gazeLock = true;
    this.tiltBoost = 0;
    if (!startedAwake) {
      await wait(350);
      if (!alive()) return;
      this.awake = 1; // abre os olhos e ergue a cabeça (interpolado na cena)
      await wait(1400);
    } else {
      this.blinkRequest = true;
      await wait(450);
    }
    if (!alive()) return;
    this.sequenceExpression = 'attentive';
    await wait(550);
    if (!alive()) return;
    this.tiltBoost = 0.13;
    await wait(650);
    if (!alive()) return;
    this.sequenceExpression = 'smiling';
    await wait(500);
    if (!alive()) return;
    if (opts.wave) {
      this.waving = true;
      setTimeout(() => {
        if (alive()) this.waving = false;
      }, 3200);
    }
    await wait(450);
    if (!alive()) return;
    this.sequenceExpression = 'greeting';
    try {
      await opts.speak(() => !alive());
    } catch (err) {
      console.warn('[saudação] falha na fala', err);
    }
    if (!alive()) return;
    await wait(250);
    this.waving = false;
    this.tiltBoost = 0;
    this.sequenceExpression = 'smiling';
    await wait(900);
    if (!alive()) return;
    this.sequenceExpression = null;
    this.gazeLock = false;
    this.greeting = false;
    this.emit();
  }
}
