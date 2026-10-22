import { useEffect, useState } from 'react';
import { listDevices, supportsOutputSelection, type DeviceLists } from '../../lib/media/devices';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { Toggle } from '../../ui/controls';

function Select({ label, value, options, onChange, disabled }: { label: string; value: string; options: MediaDeviceInfo[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-ink-900 px-3 text-sm outline-none focus:border-gold-400/60 disabled:opacity-40"
      >
        <option value="">Padrão do sistema</option>
        {options.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `Dispositivo ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DevicesPanel({ s, session }: { s: OperatorSnapshot; session: OperatorSession }) {
  const [devices, setDevices] = useState<DeviceLists>({ audioInputs: [], audioOutputs: [], videoInputs: [] });
  useEffect(() => {
    const refresh = () => void listDevices().then(setDevices);
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [s.mic]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="grid gap-4">
        <Select label="Microfone do operador" value={s.micDeviceId ?? ''} options={devices.audioInputs} onChange={(id) => void session.setMicDevice(id)} disabled={s.phase !== 'live'} />
        <Select
          label="Saída de áudio (ambiente do robô)"
          value={s.outputDeviceId ?? ''}
          options={devices.audioOutputs}
          onChange={(id) => void session.setOutputDevice(id)}
          disabled={!supportsOutputSelection()}
        />
        {!supportsOutputSelection() && <p className="text-[11px] text-white/35">Este navegador não permite escolher a saída de áudio.</p>}
      </div>
      <div className="grid content-start gap-1">
        <span className="eyebrow mb-1">Dispositivo do robô</span>
        <Toggle
          checked={s.config.ambientAudio}
          onChange={(ambientAudio) => session.setConfig({ ambientAudio })}
          label="Receber áudio ambiente"
          hint="Microfone do robô transmitido para você."
        />
        <Toggle
          checked={s.config.halfDuplex}
          onChange={(halfDuplex) => session.setConfig({ halfDuplex })}
          label="Anti-eco (half-duplex)"
          hint="O microfone do robô pausa enquanto ele fala, evitando que você ouça a própria voz de volta."
        />
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">
          O cancelamento de eco do navegador fica sempre ativo nos dois lados. Para melhor resultado, o operador deve usar fones de ouvido.
        </p>
      </div>
    </div>
  );
}
