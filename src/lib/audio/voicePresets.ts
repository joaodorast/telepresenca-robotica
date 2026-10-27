export interface VoiceSettings {
  /** Liga/desliga todo o processamento robótico (voz natural quando falso). */
  enabled: boolean;
  /** Intensidade global do efeito (0–1). */
  intensity: number;
  /** Fator de tom (0.6 = mais grave, 1.4 = mais agudo). */
  pitch: number;
  /** Deslocamento das ressonâncias (formantes) metálicas. */
  formant: number;
  /** Frequência da modulação em anel (Hz). */
  ringFreq: number;
  ringMix: number;
  /** Ressonância metálica (comb filter com realimentação). */
  metallic: number;
  /** Textura digital (bit-crush leve). */
  crush: number;
  /** Limiar do noise gate (dBFS). */
  gateDb: number;
  inputGain: number;
  outputGain: number;
  /** Supressão de ruído do navegador (aplicada na captura). */
  noiseSuppression: boolean;
}

export const VOICE_PRESETS: Record<string, { label: string; hint: string; settings: Omit<VoiceSettings, 'enabled' | 'inputGain' | 'outputGain' | 'noiseSuppression' | 'gateDb'> }> = {
  assistente: {
    label: 'Assistente',
    hint: 'Simpático e claro',
    settings: { intensity: 1, pitch: 1.1, formant: 1.12, ringFreq: 34, ringMix: 0.22, metallic: 0.32, crush: 0.06 },
  },
  classico: {
    label: 'Clássico',
    hint: 'Robô de ficção científica',
    settings: { intensity: 1, pitch: 0.88, formant: 0.95, ringFreq: 52, ringMix: 0.8, metallic: 0.65, crush: 0.25 },
  },
  grave: {
    label: 'Grave',
    hint: 'Timbre profundo',
    settings: { intensity: 1, pitch: 0.82, formant: 0.86, ringFreq: 28, ringMix: 0.3, metallic: 0.42, crush: 0.1 },
  },
  sintetico: {
    label: 'Sintético',
    hint: 'Digital e texturizado',
    settings: { intensity: 1, pitch: 1, formant: 1.05, ringFreq: 105, ringMix: 0.38, metallic: 0.25, crush: 0.34 },
  },
};

export const DEFAULT_VOICE: VoiceSettings = {
  enabled: true,
  ...VOICE_PRESETS.classico.settings,
  gateDb: -52,
  inputGain: 1,
  outputGain: 1,
  noiseSuppression: true,
};
