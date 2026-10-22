import { useCallback } from 'react';
import { Mic, MicOff, RotateCw, Volume2, VolumeX } from 'lucide-react';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { cx, LevelBar, Slider } from '../../ui/controls';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function RoundToggle({ on, onClick, children, label, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40',
        on ? 'border-gold-400/50 bg-gold-400/10 text-gold-300 shadow-glow' : 'border-white/10 bg-white/5 text-white/60',
      )}
    >
      {children}
    </button>
  );
}

export function AudioDock({ s, session }: { s: OperatorSnapshot; session: OperatorSession }) {
  const readVoice = useCallback(() => session.voiceLevel, [session]);
  const readRemote = useCallback(() => session.remoteLevel, [session]);
  const micLabel = {
    off: 'Microfone desligado',
    on: 'Microfone ativo',
    muted: 'Microfone silenciado',
    error: 'Microfone indisponível',
  }[s.mic];
  const robotMic = s.robot?.mic;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="panel p-4">
        <p className="eyebrow mb-3">Sua voz</p>
        <div className="flex items-center gap-3">
          <RoundToggle on={s.mic === 'on'} onClick={() => session.toggleMic()} label={s.mic === 'muted' ? 'Ativar microfone' : 'Silenciar microfone'} disabled={s.mic === 'off' || s.mic === 'error'}>
            {s.mic === 'on' ? <Mic size={18} /> : <MicOff size={18} />}
          </RoundToggle>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className={cx(s.mic === 'error' ? 'text-red-300' : 'text-white/85')}>{micLabel}</span>
              {s.mic === 'error' && (
                <button className="flex items-center gap-1 text-xs text-gold-300 hover:underline" onClick={() => session.retryMic()}>
                  <RotateCw size={12} /> Tentar de novo
                </button>
              )}
            </div>
            <LevelBar read={readVoice} active={s.mic === 'on'} />
          </div>
        </div>
        {s.micError && <p className="mt-2 text-xs text-red-300/80">{s.micError}</p>}
        <div className="mt-4">
          <Slider label="Ganho do microfone" value={s.voice.inputGain} min={0} max={2.5} onChange={(v) => session.setVoice({ inputGain: v })} format={pct} />
        </div>
      </section>

      <section className="panel p-4">
        <p className="eyebrow mb-3">Alto-falantes</p>
        <div className="flex items-center gap-3">
          <RoundToggle on={!s.remoteMuted} onClick={() => session.toggleRemoteMute()} label={s.remoteMuted ? 'Ouvir o ambiente' : 'Silenciar o ambiente'}>
            {s.remoteMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </RoundToggle>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 text-sm text-white/85">
              {robotMic === 'on' ? (s.config.ambientAudio ? 'Áudio do ambiente' : 'Ambiente desativado') : robotMic === 'error' ? 'Microfone do robô indisponível' : 'Sem áudio do robô'}
            </div>
            <LevelBar read={readRemote} active={!s.remoteMuted && robotMic === 'on'} />
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <Slider label="Volume para você" value={s.remoteVolume} min={0} max={1} onChange={(v) => session.setRemoteVolume(v)} format={pct} />
          <Slider label="Volume no robô" value={s.config.robotVolume} min={0} max={1} onChange={(v) => session.setConfig({ robotVolume: v })} format={pct} />
        </div>
      </section>
    </div>
  );
}
