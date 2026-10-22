import type { ExpressionId } from '../shared/protocol';

/** Parâmetros faciais contínuos — todas as expressões são combinações destes valores. */
export interface FaceParams {
  /** Altura das sobrancelhas (−1 baixa … 1 alta). */
  browY: number;
  /** Inclinação: positivo = parte interna sobe (preocupação/tristeza), negativo = franze (raiva). */
  browAngle: number;
  /** Assimetria (confusão): uma sobe, outra desce. */
  browAsym: number;
  /** Pálpebra superior: 0 aberta … 1 fechada. */
  lidTop: number;
  /** Pálpebra inferior: 0 relaxada … 1 elevada (olhos sorridentes). */
  lidBottom: number;
  /** Escala da abertura dos olhos. */
  eyeOpen: number;
  /** Escala da pupila. */
  pupil: number;
  /** Curvatura da boca: −1 triste … 1 sorriso. */
  smile: number;
  open: number;
  width: number;
  round: number;
  /** Boca torta (confusão). */
  skew: number;
  /** Rotação da cabeça (rad). */
  tilt: number;
  pitch: number;
  yaw: number;
}

export const NEUTRAL: FaceParams = {
  browY: 0,
  browAngle: 0,
  browAsym: 0,
  lidTop: 0.12,
  lidBottom: 0.05,
  eyeOpen: 1,
  pupil: 1,
  smile: 0.12,
  open: 0,
  width: 0.5,
  round: 0,
  skew: 0,
  tilt: 0,
  pitch: 0,
  yaw: 0,
};

const make = (p: Partial<FaceParams>): FaceParams => ({ ...NEUTRAL, ...p });

export const EXPRESSIONS: Record<ExpressionId, { label: string; params: FaceParams }> = {
  neutral: { label: 'Neutro', params: NEUTRAL },
  happy: { label: 'Feliz', params: make({ browY: 0.35, browAngle: 0.15, lidBottom: 0.45, smile: 0.85, open: 0.28, width: 0.72, tilt: 0.05, pitch: -0.03 }) },
  smiling: { label: 'Sorrindo', params: make({ browY: 0.15, lidBottom: 0.3, smile: 1, open: 0.04, width: 0.72, tilt: 0.04 }) },
  surprised: { label: 'Surpreso', params: make({ browY: 1, browAngle: 0.1, lidTop: 0, lidBottom: 0, eyeOpen: 1.12, pupil: 0.78, smile: 0, open: 0.55, width: 0.3, round: 0.85, pitch: -0.06 }) },
  sad: { label: 'Triste', params: make({ browY: -0.1, browAngle: 0.9, lidTop: 0.38, smile: -0.75, width: 0.4, pitch: 0.12, tilt: -0.07 }) },
  angry: { label: 'Zangado', params: make({ browY: -0.5, browAngle: -0.9, lidTop: 0.32, lidBottom: 0.25, pupil: 0.9, smile: -0.55, width: 0.6, pitch: 0.06 }) },
  confused: { label: 'Confuso', params: make({ browY: 0.2, browAsym: 0.8, browAngle: 0.15, lidTop: 0.18, smile: -0.15, width: 0.42, skew: 0.7, tilt: 0.15, yaw: 0.05 }) },
  attentive: { label: 'Atento', params: make({ browY: 0.3, lidTop: 0.02, eyeOpen: 1.06, pupil: 1.12, smile: 0.18, pitch: -0.05 }) },
  talking: { label: 'Falando', params: make({ browY: 0.12, smile: 0.32, lidBottom: 0.12 }) },
  listening: { label: 'Escutando', params: make({ browY: 0.2, browAngle: 0.15, lidTop: 0.06, pupil: 1.08, smile: 0.22, tilt: 0.11 }) },
  greeting: { label: 'Saudando', params: make({ browY: 0.4, browAngle: 0.15, lidBottom: 0.3, smile: 0.95, open: 0.12, width: 0.7, tilt: 0.08, pitch: -0.03 }) },
};

export const EXPRESSION_ORDER: ExpressionId[] = [
  'neutral',
  'happy',
  'smiling',
  'surprised',
  'sad',
  'angry',
  'confused',
  'attentive',
  'talking',
  'listening',
  'greeting',
];

export const PARAM_KEYS = Object.keys(NEUTRAL) as (keyof FaceParams)[];
