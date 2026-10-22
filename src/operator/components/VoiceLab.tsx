import { VOICE_PRESETS } from '../../lib/audio/voicePresets';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { cx, Slider, Toggle } from '../../ui/controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Ajustes da cadeia de voz robótica — aplicados em tempo real no AudioWorklet. */
export function VoiceLab({ s, session }: { s: OperatorSnapshot; session: OperatorSession }) {
  const v = s.voice;
  const set = session.setVoice.bind(session);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(VOICE_PRESETS).map(([id, p]) => (
          <button
            key={id}
            onClick={() => session.applyPreset(id)}
            className={cx(
              'rounded-xl border px-3 py-2 text-left transition',
              s.voicePreset === id && v.enabled ? 'border-gold-400/60 bg-gold-400/10' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20',
            )}
          >
            <span className="block text-sm">{p.label}</span>
            <span className="block text-[11px] text-white/40">{p.hint}</span>
          </button>
        ))}
        {s.voicePreset === null && <span className="text-xs text-white/40">Personalizado</span>}
      </div>

      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Toggle checked={v.enabled} onChange={(enabled) => set({ enabled })} label="Voz robótica" hint="Desative para transmitir sua voz natural (útil em testes)." />
        </div>
        <Slider label="Intensidade do efeito" value={v.intensity} min={0} max={1} onChange={(x) => set({ intensity: x })} format={pct} disabled={!v.enabled} />
        <Slider label="Tom (pitch)" value={v.pitch} min={0.6} max={1.5} onChange={(x) => set({ pitch: x })} format={(x) => `${x.toFixed(2)}×`} disabled={!v.enabled} />
        <Slider label="Formantes / ressonância" value={v.formant} min={0.7} max={1.4} onChange={(x) => set({ formant: x })} format={(x) => `${x.toFixed(2)}×`} disabled={!v.enabled} />
        <Slider label="Timbre metálico" value={v.metallic} min={0} max={0.9} onChange={(x) => set({ metallic: x })} format={pct} disabled={!v.enabled} />
        <Slider label="Modulação (frequência)" value={v.ringFreq} min={0} max={220} step={1} onChange={(x) => set({ ringFreq: x })} format={(x) => `${Math.round(x)} Hz`} disabled={!v.enabled} />
        <Slider label="Modulação (quantidade)" value={v.ringMix} min={0} max={1} onChange={(x) => set({ ringMix: x })} format={pct} disabled={!v.enabled} />
        <Slider label="Textura digital" value={v.crush} min={0} max={0.6} onChange={(x) => set({ crush: x })} format={pct} disabled={!v.enabled} />
        <Slider label="Volume de saída" value={v.outputGain} min={0} max={2} onChange={(x) => set({ outputGain: x })} format={pct} />
        <Slider label="Porta de ruído (limiar)" value={v.gateDb} min={-80} max={-25} step={1} onChange={(x) => set({ gateDb: x })} format={(x) => `${Math.round(x)} dB`} />
        <div className="grid gap-1">
          <Toggle checked={v.noiseSuppression} onChange={(noiseSuppression) => set({ noiseSuppression })} label="Supressão de ruído" hint="Filtro do navegador aplicado na captura." />
          <Toggle checked={s.monitor} onChange={(m) => session.setMonitor(m)} label="Ouvir minha voz processada" hint="Use fones de ouvido para evitar microfonia." />
        </div>
      </div>
    </div>
  );
}
