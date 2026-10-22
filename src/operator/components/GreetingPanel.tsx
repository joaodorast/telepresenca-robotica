import { useEffect, useState } from 'react';
import { Circle, Play, Square, Trash2 } from 'lucide-react';
import type { OperatorSession, OperatorSnapshot } from '../OperatorSession';
import { Button, cx, Notice, Slider, Toggle } from '../../ui/controls';

export function GreetingPanel({ s, session }: { s: OperatorSnapshot; session: OperatorSession }) {
  const c = s.config;
  const [text, setText] = useState(c.greetingText);
  useEffect(() => setText(c.greetingText), [c.greetingText]);
  const recording = s.recording === 'recording';

  return (
    <div className="grid gap-5">
      <label className="block">
        <span className="eyebrow">Fala da saudação</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== c.greetingText && session.setConfig({ greetingText: text.trim() })}
          rows={2}
          maxLength={200}
          className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold-400/60"
        />
        <span className="text-[11px] text-white/35">Exibida no balão do robô durante a apresentação.</span>
      </label>

      <Toggle checked={c.autoGreeting} onChange={(autoGreeting) => session.setConfig({ autoGreeting })} label="Saudar automaticamente" hint="Executa a apresentação quando o robô inicia a sessão." />

      <div>
        <span className="eyebrow">Voz da saudação</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['recorded', 'Gravada com voz robótica', 'Sua voz, pelo mesmo processamento; boca guiada pelo áudio.'],
              ['tts', 'Síntese do navegador', 'Sem gravação; boca guiada pelo texto. Sem efeito robótico.'],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              onClick={() => session.setConfig({ greetingVoice: id })}
              disabled={id === 'recorded' && !c.greetingAudio}
              className={cx(
                'rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40',
                c.greetingVoice === id ? 'border-gold-400/60 bg-gold-400/10' : 'border-white/[0.07] hover:border-white/20',
              )}
            >
              <span className="block text-sm">{label}</span>
              <span className="block text-[11px] text-white/40">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!recording ? (
            <Button onClick={() => void session.startRecording()} disabled={s.mic !== 'on'}>
              <Circle size={14} className="fill-red-500 text-red-500" /> Gravar saudação
            </Button>
          ) : (
            <Button variant="danger" onClick={() => session.stopRecording()}>
              <Square size={14} /> Parar gravação
            </Button>
          )}
          {c.greetingAudio && !recording && (
            <>
              <Button variant="subtle" onClick={() => void new Audio(c.greetingAudio!).play()}>
                <Play size={14} /> Ouvir
              </Button>
              <Button variant="subtle" onClick={() => session.setConfig({ greetingAudio: null, greetingVoice: 'tts' })}>
                <Trash2 size={14} /> Descartar
              </Button>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/40">
          {recording
            ? 'Gravando (máx. 10 s)… A transmissão ao vivo para o robô está pausada.'
            : 'Fale o texto da saudação. A gravação usa a configuração atual da voz robótica.'}
        </p>
      </div>

      {c.greetingVoice === 'tts' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Slider label="Tom da síntese" value={c.ttsPitch} min={0.3} max={1.6} onChange={(ttsPitch) => session.setConfig({ ttsPitch })} format={(x) => x.toFixed(2)} />
          <Slider label="Velocidade da síntese" value={c.ttsRate} min={0.7} max={1.3} onChange={(ttsRate) => session.setConfig({ ttsRate })} format={(x) => `${x.toFixed(2)}×`} />
          <div className="sm:col-span-2">
            <Notice tone="info">A síntese de voz do navegador não pode passar pela cadeia de áudio robótica (limitação da Web Speech API). Para a voz robotizada também na saudação, grave-a acima.</Notice>
          </div>
        </div>
      )}
    </div>
  );
}
